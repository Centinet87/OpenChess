import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { config } from 'dotenv';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { seedMembers } from '../testing/seed-members';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../app/auth/api/cookies/session.cookies';
import type { GameAck, GameView } from '@openchess/contracts';
import { MESSAGE_LIMIT } from './games.gateway';

config({ path: '../../.env', quiet: true });
const domain = process.env['APP_DOMAIN'] ?? 'localhost';

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `ga-${run}`;
const slugB = `gb-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);

let app: NestExpressApplication;
let url: string;
const users = {} as Record<Name, { id: string; cookie: string }>;
const sockets: Socket[] = [];

function http(name: Name, slug: string) {
  const agent = request(app.getHttpServer());
  const prep = (r: request.Test) =>
    r.set('Cookie', users[name].cookie).set('Host', `${slug}.${domain}`);
  return {
    get: (p: string) => prep(agent.get(`/api${p}`)),
    post: (p: string) => prep(agent.post(`/api${p}`)),
  };
}

function connect(cookie?: string, origin?: string): Socket {
  const socket = io(`${url}/games`, {
    transports: ['websocket'],
    extraHeaders: {
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

function emit(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<GameAck> {
  return socket.timeout(5000).emitWithAck(event, payload);
}

/** Espera el próximo game:update que cumpla la condición. */
function nextUpdate(
  socket: Socket,
  match: (u: { game: GameView; events: { type: string }[] }) => boolean,
  timeoutMs = 8000,
): Promise<{ game: GameView; events: { type: string }[] }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('sin game:update')),
      timeoutMs,
    );
    const onUpdate = (u: { game: GameView; events: { type: string }[] }) => {
      if (!match(u)) return;
      clearTimeout(timer);
      socket.off('game:update', onUpdate);
      resolve(u);
    };
    socket.on('game:update', onUpdate);
  });
}

async function challenge(timeControl: string): Promise<GameView> {
  const created = await http('ana', slugA)
    .post('/club/games')
    .send({ opponentId: users.beto.id, timeControl, color: 'white' })
    .expect(201);
  await http('beto', slugA)
    .post(`/club/games/${created.body.id}/accept`)
    .expect(200);
  return created.body;
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

  // Club A: ana y beto. Club B: solo caro. El cliente base se salta RLS para preparar datos.
  const [clubA, clubB] = await Promise.all(
    [slugA, slugB].map((slug) =>
      base.club.create({ data: { slug, name: slug } }),
    ),
  );
  await seedMembers(base, [
    { clubId: clubA.id, userId: users.ana.id, role: 'Admin' },
    { clubId: clubA.id, userId: users.beto.id, role: 'Alumno' },
    { clubId: clubB.id, userId: users.caro.id, role: 'Admin' },
  ]);
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  // Primero la app: así termina de contar en el ranking las partidas pendientes.
  await app.close();
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

describe('partidas', () => {
  it('desafío por HTTP: queda pendiente hasta que el rival acepta', async () => {
    const res = await http('ana', slugA)
      .post('/club/games')
      .send({ opponentId: users.beto.id, timeControl: '5+3', color: 'white' })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      whiteId: users.ana.id,
    });

    await http('ana', slugA)
      .post(`/club/games/${res.body.id}/accept`)
      .expect(409);
    const accepted = await http('beto', slugA)
      .post(`/club/games/${res.body.id}/accept`)
      .expect(200);
    expect(accepted.body.status).toBe('in_progress');
  });

  it('no se desafía a alguien de otro club, ni se ve una partida desde otro club', async () => {
    await http('ana', slugA)
      .post('/club/games')
      .send({ opponentId: users.caro.id, timeControl: '5+0' })
      .expect(422);

    const game = await challenge('5+0');
    await http('caro', slugA).get(`/club/games/${game.id}`).expect(403);
    await http('caro', slugB).get(`/club/games/${game.id}`).expect(404);
  });

  it('sin sesión o desde otro origen, el WebSocket no conecta', async () => {
    await expect(connected(connect())).rejects.toThrow('Inicia sesión');

    await expect(
      connected(connect(users.ana.cookie, 'https://evil.example')),
    ).rejects.toThrow('Origen no permitido');
  });

  it('juego en vivo: la jugada llega al rival y el servidor valida turno y legalidad', async () => {
    const game = await challenge('5+0');
    const ana = connect(users.ana.cookie);
    const beto = connect(users.beto.cookie);
    await Promise.all([connected(ana), connected(beto)]);

    expect(
      await emit(ana, 'game:join', { club: slugA, gameId: game.id }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await emit(beto, 'game:join', { club: slugA, gameId: game.id }),
    ).toMatchObject({
      ok: true,
    });

    const seen = nextUpdate(beto, (u) =>
      u.events.some((e) => e.type === 'MoveMade'),
    );
    const move = { gameId: game.id, action: 'move', from: 'e2', to: 'e4' };
    expect(await emit(ana, 'game:command', move)).toMatchObject({ ok: true });
    expect((await seen).game.pgn).toContain('e4');

    expect(
      await emit(ana, 'game:command', { ...move, from: 'd2', to: 'd4' }),
    ).toMatchObject({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
    expect(
      await emit(beto, 'game:command', {
        gameId: game.id,
        action: 'move',
        from: 'e7',
        to: 'e4',
      }),
    ).toMatchObject({ ok: false, code: 'ILLEGAL_MOVE' });
    expect(
      await emit(beto, 'game:command', { gameId: game.id, action: 'teleport' }),
    ).toMatchObject({ ok: false, code: 'BAD_REQUEST' });

    const finished = nextUpdate(ana, (u) => u.game.status === 'finished');
    expect(
      await emit(beto, 'game:command', { gameId: game.id, action: 'resign' }),
    ).toMatchObject({
      ok: true,
    });
    expect((await finished).game).toMatchObject({
      result: '1-0',
      termination: 'resignation',
    });
  });

  it('un intruso no puede unirse ni jugar', async () => {
    const game = await challenge('5+0');
    const caro = connect(users.caro.cookie);
    await connected(caro);

    for (const club of [slugA, slugB]) {
      expect(
        await emit(caro, 'game:join', { club, gameId: game.id }),
      ).toMatchObject({
        ok: false,
        code: 'GAME_NOT_FOUND',
      });
    }
    expect(
      await emit(caro, 'game:command', {
        gameId: game.id,
        action: 'move',
        from: 'e2',
        to: 'e4',
      }),
    ).toMatchObject({ ok: false, code: 'GAME_NOT_FOUND' });
  });

  it('el reloj del servidor cierra la partida por tiempo sin que nadie juegue', async () => {
    // 0.05 minutos = 3 segundos para las negras.
    const game = await challenge('0.05+0');
    const ana = connect(users.ana.cookie);
    await connected(ana);
    await emit(ana, 'game:join', { club: slugA, gameId: game.id });

    const flagged = nextUpdate(ana, (u) => u.game.status === 'finished', 8000);
    await emit(ana, 'game:command', {
      gameId: game.id,
      action: 'move',
      from: 'e2',
      to: 'e4',
    });

    expect((await flagged).game).toMatchObject({
      result: '1-0',
      termination: 'timeout',
    });
  }, 15_000);

  it('una sesión vencida corta el socket', async () => {
    const short = await app
      .get(JwtService)
      .signAsync({ sub: users.ana.id }, { expiresIn: '1s' });
    const socket = connect(`${ACCESS_COOKIE}=${short}`);
    await connected(socket);
    const closed = new Promise<string>((resolve) =>
      socket.once('disconnect', (reason) => resolve(reason)),
    );
    expect(await closed).toBe('io server disconnect');
  }, 5_000);

  it('más de 30 mensajes en 10 segundos se rechazan', async () => {
    const ana = connect(users.ana.cookie);
    await connected(ana);
    const acks = [];
    for (let i = 0; i < MESSAGE_LIMIT + 1; i++) {
      acks.push(await emit(ana, 'game:command', { gameId: 'x' }));
    }
    expect(acks[0]).toMatchObject({ code: 'BAD_REQUEST' });
    expect(acks[MESSAGE_LIMIT]).toMatchObject({ code: 'RATE_LIMITED' });
  });

  // Al final: saca a beto del club.
  it('a quien sacan del club no le sirve el socket que tenía abierto', async () => {
    const game = await challenge('5+0');
    const ana = connect(users.ana.cookie);
    const beto = connect(users.beto.cookie);
    await Promise.all([connected(ana), connected(beto)]);
    await emit(ana, 'game:join', { club: slugA, gameId: game.id });
    await emit(beto, 'game:join', { club: slugA, gameId: game.id });
    await emit(ana, 'game:command', {
      gameId: game.id,
      action: 'move',
      from: 'e2',
      to: 'e4',
    });

    await base.membership.deleteMany({ where: { userId: users.beto.id } });
    expect(
      await emit(beto, 'game:command', {
        gameId: game.id,
        action: 'move',
        from: 'e7',
        to: 'e5',
      }),
    ).toMatchObject({ ok: false, code: 'GAME_NOT_FOUND' });
  });
});
