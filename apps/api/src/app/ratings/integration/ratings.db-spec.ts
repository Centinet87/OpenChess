import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { GameAck } from '@openchess/contracts';
import { createPrismaClient } from '@openchess/database';
import { config } from 'dotenv';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { seedMembers } from '../../../testing/seed-members';
import { AppModule } from '../../app.module';
import { ACCESS_COOKIE } from '../../auth/api/cookies/session.cookies';
import { configureApp } from '../../configure-app';
import { RatingsListener } from '../api/handlers/ratings.listener';
import { RatingsUseCases } from '../application/use-cases/ratings.use-cases';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `ra-${run}`;
const slugB = `rb-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);

let app: NestExpressApplication;
let url: string;
let clubAId: string;
const users = {} as Record<Name, { id: string; cookie: string }>;
const sockets: Socket[] = [];

function http(name: Name, slug: string) {
  return {
    get: (p: string) =>
      request(app.getHttpServer())
        .get(`/api${p}`)
        .set('Cookie', users[name].cookie)
        .set('Host', `${slug}.localhost`),
    post: (p: string) =>
      request(app.getHttpServer())
        .post(`/api${p}`)
        .set('Cookie', users[name].cookie)
        .set('Host', `${slug}.localhost`),
  };
}

async function socketFor(name: Name, gameId: string): Promise<Socket> {
  const socket = io(`${url}/games`, {
    transports: ['websocket'],
    extraHeaders: { cookie: users[name].cookie },
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  await command(socket, 'game:join', { club: slugA, gameId });
  return socket;
}

async function command(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<void> {
  const ack: GameAck = await socket.timeout(5000).emitWithAck(event, payload);
  if (!ack.ok) throw new Error(`${event}: ${JSON.stringify(ack)}`);
}

/** Ana (blancas) contra Beto en el club A, hasta que alguien la termina. */
async function play(finish: 'beto-resigns' | 'ana-aborts'): Promise<string> {
  const created = await http('ana', slugA)
    .post('/club/games')
    .send({ opponentId: users.beto.id, timeControl: '5+0', color: 'white' })
    .expect(201);
  const gameId: string = created.body.id;
  await http('beto', slugA).post(`/club/games/${gameId}/accept`).expect(200);

  const ana = await socketFor('ana', gameId);
  if (finish === 'ana-aborts') {
    await command(ana, 'game:command', { gameId, action: 'abort' });
  } else {
    const beto = await socketFor('beto', gameId);
    await command(ana, 'game:command', {
      gameId,
      action: 'move',
      from: 'e2',
      to: 'e4',
    });
    await command(beto, 'game:command', { gameId, action: 'resign' });
  }
  // El ranking se actualiza aparte de la jugada: hay que esperarlo.
  await app.get(RatingsListener).idle();
  return gameId;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.listen(0);
  url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;

  for (const [i, name] of names.entries()) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: emails[i], password: randomUUID(), displayName: name })
      .expect(201);
    const raw = res.headers['set-cookie'] as unknown as string[];
    const cookie =
      raw.find((c) => c.startsWith(`${ACCESS_COOKIE}=`))?.split(';')[0] ?? '';
    const user = await base.user.findUniqueOrThrow({
      where: { email: emails[i] },
    });
    users[name] = { id: user.id, cookie };
  }

  // Club A: ana y beto. Club B: solo caro.
  const [clubA, clubB] = await Promise.all(
    [slugA, slugB].map((slug) =>
      base.club.create({ data: { slug, name: slug } }),
    ),
  );
  clubAId = clubA.id;
  await seedMembers(base, [
    { clubId: clubA.id, userId: users.ana.id, role: 'Admin' },
    { clubId: clubA.id, userId: users.beto.id, role: 'Alumno' },
    { clubId: clubB.id, userId: users.caro.id, role: 'Admin' },
  ]);
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await app.close();
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

describe('ranking', () => {
  let gameId: string;

  it('al terminar una partida, el ganador sube y el perdedor baja en la tabla del club', async () => {
    gameId = await play('beto-resigns');

    const res = await http('beto', slugA).get('/club/ratings').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        position: 1,
        userId: users.ana.id,
        displayName: 'ana',
        games: 1,
        wins: 1,
        provisional: true,
      }),
      expect.objectContaining({
        position: 2,
        userId: users.beto.id,
        games: 1,
        losses: 1,
      }),
    ]);
    expect(res.body[0].rating).toBeGreaterThan(1500);
    expect(res.body[1].rating).toBeLessThan(1500);
  });

  it('el perfil trae el historial del jugador', async () => {
    const res = await http('ana', slugA)
      .get(`/club/ratings/${users.beto.id}`)
      .expect(200);
    expect(res.body).toMatchObject({ userId: users.beto.id, games: 1 });
    expect(res.body.history).toEqual([
      expect.objectContaining({
        gameId,
        opponentId: users.ana.id,
        score: 0,
        ratingBefore: 1500,
      }),
    ]);
  });

  it('si el evento llega dos veces, la partida se cuenta una sola vez', async () => {
    const cls = app.get(ClsService);
    const again = await cls.run(async () => {
      cls.set('clubId', clubAId);
      return app.get(RatingsUseCases).recordGame({
        gameId,
        clubId: clubAId,
        whiteId: users.ana.id,
        blackId: users.beto.id,
        result: '1-0',
      });
    });
    expect(again).toBeNull();

    const res = await http('ana', slugA).get('/club/ratings').expect(200);
    expect(res.body[0].games).toBe(1);
  });

  it('una partida abortada no cuenta', async () => {
    await play('ana-aborts');
    const res = await http('ana', slugA).get('/club/ratings').expect(200);
    expect(res.body.map((r: { games: number }) => r.games)).toEqual([1, 1]);
  });

  it('otro club no ve este ranking ni los perfiles de sus miembros', async () => {
    const res = await http('caro', slugB).get('/club/ratings').expect(200);
    expect(res.body).toEqual([]);
    await http('caro', slugB).get(`/club/ratings/${users.ana.id}`).expect(404);
    await http('caro', slugA).get('/club/ratings').expect(403);
  });
});
