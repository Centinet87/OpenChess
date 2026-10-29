import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import type {
  ChessPlatform,
  ExternalGame,
  Platform,
  PlatformProfile,
} from '@openchess/linked-accounts';
import { AppModule } from '../app/app.module';
import { seedMembers } from '../testing/seed-members';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../identity/cookies';
import { RatingsListener } from '../ratings/ratings.listener';
import type { LichessOAuth } from './lichess';
import { LICHESS_OAUTH } from './linked-accounts.controller';
import { CHESS_PLATFORMS } from './linked-accounts.module';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `la-${run}`;
const slugB = `lb-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);
// Usuarios en las plataformas, únicos por corrida (una cuenta verificada es de una sola persona).
const ext = {
  ana: `ana-${run}`,
  beto: `beto-${run}`,
  betoLichess: `betol-${run}`,
};

/** Doble de una plataforma: perfiles y partidas que el test controla. */
class FakePlatform implements ChessPlatform {
  readonly profiles = new Map<string, PlatformProfile>();
  games: ExternalGame[] = [];
  constructor(readonly platform: Platform) {}

  async profile(username: string) {
    return this.profiles.get(username) ?? null;
  }

  async recentGames(username: string) {
    return this.games.filter(
      (g) => g.white === username || g.black === username,
    );
  }
}

const lichess = new FakePlatform('lichess');
const chesscom = new FakePlatform('chesscom');
/** Lichess "inicia sesión" a quien venga con el código ok-<usuario>. */
const oauth: LichessOAuth = {
  authorizeUrl: (state) => `https://lichess.test/oauth?state=${state}`,
  usernameFromCode: async (code) =>
    code.startsWith('ok-') ? code.slice(3) : null,
};

let app: NestExpressApplication;
const users = {} as Record<Name, { id: string; cookie: string }>;

function as(name: Name, slug?: string) {
  const host = slug ? `${slug}.localhost` : 'localhost';
  const prep = (r: request.Test) =>
    r.set('Cookie', users[name].cookie).set('Host', host);
  const agent = request(app.getHttpServer());
  return {
    get: (p: string) => prep(agent.get(`/api${p}`)),
    post: (p: string) => prep(agent.post(`/api${p}`)),
  };
}

function profile(name: string, editableText = ''): PlatformProfile {
  return { displayName: name, ratings: { blitz: 1700 }, editableText };
}

function chessComGame(
  id: string,
  white: string,
  black: string,
  result: ExternalGame['result'],
  minutesAgo: number,
): ExternalGame {
  return {
    platform: 'chesscom',
    externalId: `${run}-${id}`,
    url: `https://www.chess.com/game/live/${id}`,
    white,
    black,
    whiteName: white,
    blackName: black,
    result,
    speed: 'blitz',
    standard: true,
    pgn: `[Event "Live Chess"]\n\n1. e4 e5 ${result ?? '*'}`,
    playedAt: new Date(Date.now() - minutesAgo * 60_000),
  };
}

/** Vincula Chess.com con el código en el perfil, como lo haría la persona. */
async function linkChessCom(name: Name, username: string): Promise<void> {
  chesscom.profiles.set(username, profile(username));
  const started = await as(name)
    .post('/accounts/chesscom')
    .send({ username })
    .expect(201);
  chesscom.profiles.set(
    username,
    profile(username, `Santiago ${started.body.verificationCode}`),
  );
  await as(name).post('/accounts/chesscom/verify').expect(200);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CHESS_PLATFORMS)
    .useValue({ lichess, chesscom })
    .overrideProvider(LICHESS_OAUTH)
    .useValue(oauth)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

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
  await seedMembers(base, [
    { clubId: clubA.id, userId: users.ana.id, role: 'Admin' },
    { clubId: clubA.id, userId: users.beto.id, role: 'Alumno' },
    { clubId: clubB.id, userId: users.caro.id, role: 'Admin' },
  ]);
});

afterAll(async () => {
  await app.close();
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

describe('cuentas vinculadas', () => {
  it('Chess.com: se verifica cuando el código aparece en el perfil', async () => {
    chesscom.profiles.set(ext.ana, profile('Ana_C'));
    const started = await as('ana')
      .post('/accounts/chesscom')
      .send({ username: ext.ana })
      .expect(201);
    expect(started.body).toMatchObject({
      platform: 'chesscom',
      username: ext.ana,
      verified: false,
    });
    expect(started.body.verificationCode).toMatch(/^openchess-[0-9a-f]{8}$/);

    const missing = await as('ana')
      .post('/accounts/chesscom/verify')
      .expect(422);
    expect(missing.body.code).toBe('CODE_NOT_FOUND');

    chesscom.profiles.set(
      ext.ana,
      profile('Ana_C', `Chile ${started.body.verificationCode}`),
    );
    const verified = await as('ana')
      .post('/accounts/chesscom/verify')
      .expect(200);
    expect(verified.body).toMatchObject({
      verified: true,
      verificationCode: null,
      ratings: { blitz: 1700 },
      url: 'https://www.chess.com/member/Ana_C',
    });
  });

  it('una cuenta que ya verificó otra persona no se puede verificar', async () => {
    const started = await as('caro')
      .post('/accounts/chesscom')
      .send({ username: ext.ana })
      .expect(201);
    chesscom.profiles.set(
      ext.ana,
      profile('Ana_C', started.body.verificationCode),
    );
    const res = await as('caro').post('/accounts/chesscom/verify').expect(409);
    expect(res.body.code).toBe('ALREADY_LINKED');
    await request(app.getHttpServer())
      .delete('/api/accounts/chesscom')
      .set('Cookie', users.caro.cookie)
      .expect(204);
  });

  it('Lichess: se vincula iniciando sesión allá, y el state evita el CSRF', async () => {
    lichess.profiles.set(ext.betoLichess, profile('BetoL'));
    const connect = await as('beto')
      .get('/accounts/lichess/connect')
      .expect(302);
    const state = new URL(
      connect.headers['location'] as string,
    ).searchParams.get('state');
    const oauthCookie = (connect.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('oc_lichess='))
      ?.split(';')[0];
    const cookies = `${users.beto.cookie}; ${oauthCookie}`;

    const forged = await request(app.getHttpServer())
      .get(
        `/api/accounts/lichess/callback?code=ok-${ext.betoLichess}&state=otro`,
      )
      .set('Cookie', cookies)
      .expect(302);
    expect(forged.headers['location']).toBe(
      'http://localhost:3000/cuenta?error=INVALID_STATE',
    );

    const ok = await request(app.getHttpServer())
      .get(
        `/api/accounts/lichess/callback?code=ok-${ext.betoLichess}&state=${state}`,
      )
      .set('Cookie', cookies)
      .expect(302);
    expect(ok.headers['location']).toBe(
      'http://localhost:3000/cuenta?vinculada=lichess',
    );

    const list = await as('beto').get('/accounts').expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        platform: 'lichess',
        username: ext.betoLichess,
        verified: true,
        url: 'https://lichess.org/@/BetoL',
      }),
    ]);
  });
});

describe('partidas importadas', () => {
  beforeAll(async () => {
    await linkChessCom('beto', ext.beto);
    chesscom.games = [
      chessComGame('1', ext.ana, ext.beto, '1-0', 30),
      chessComGame('2', ext.ana, 'desconocido', '0-1', 20),
      chessComGame('3', ext.beto, ext.ana, '1/2-1/2', 10),
    ];
  });

  it('trae las partidas del miembro y las jugadas entre miembros cuentan para el ranking', async () => {
    const res = await as('ana', slugA)
      .post('/club/imports')
      .send({ platform: 'chesscom' })
      .expect(201);
    expect(res.body).toEqual({ found: 3, imported: 3, rated: 2 });
    await app.get(RatingsListener).idle();

    const standings = await as('beto', slugA).get('/club/ratings').expect(200);
    expect(standings.body).toEqual([
      expect.objectContaining({
        userId: users.ana.id,
        games: 2,
        wins: 1,
        draws: 1,
      }),
      expect.objectContaining({
        userId: users.beto.id,
        games: 2,
        losses: 1,
        draws: 1,
      }),
    ]);
  });

  it('si el otro miembro importa las mismas, no se repiten ni se cuentan de nuevo', async () => {
    const res = await as('beto', slugA)
      .post('/club/imports')
      .send({ platform: 'chesscom' })
      .expect(201);
    expect(res.body).toMatchObject({ imported: 0, rated: 0 });
    await app.get(RatingsListener).idle();
    const standings = await as('ana', slugA).get('/club/ratings').expect(200);
    expect(standings.body[0].games).toBe(2);
  });

  it('se listan sin PGN y una partida trae su PGN', async () => {
    const list = await as('beto', slugA)
      .get(`/club/imports?userId=${users.beto.id}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].pgn).toBeUndefined();

    const one = await as('beto', slugA)
      .get(`/club/imports/${list.body[0].id}`)
      .expect(200);
    expect(one.body.pgn).toContain('1. e4 e5');
  });

  it('otro club no ve las partidas ni las cuentas de los miembros de este', async () => {
    expect(
      (await as('caro', slugB).get('/club/imports').expect(200)).body,
    ).toEqual([]);
    expect(
      (
        await as('caro', slugB)
          .get(`/club/accounts/${users.ana.id}`)
          .expect(200)
      ).body,
    ).toEqual([]);

    const fromA = await as('beto', slugA)
      .get(`/club/accounts/${users.ana.id}`)
      .expect(200);
    expect(fromA.body).toEqual([
      expect.objectContaining({ platform: 'chesscom', verified: true }),
    ]);
    expect(fromA.body[0].verificationCode).toBeUndefined();
  });

  it('sin la cuenta verificada no se puede importar', async () => {
    const res = await as('ana', slugA)
      .post('/club/imports')
      .send({ platform: 'lichess' })
      .expect(409);
    expect(res.body.code).toBe('NOT_LINKED');
  });
});
