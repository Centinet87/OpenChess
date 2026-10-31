import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient } from '@openchess/database';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { seedMembers } from '../../../testing/seed-members';
import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../api/cookies/session.cookies';
import { DELETED_NAME } from '../application/use-cases/account.use-cases';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const names = ['ana', 'beto'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);
const passwords = names.map(() => randomUUID());
const slugs = { shared: `acc-${run}`, solo: `acc-solo-${run}` };

let app: NestExpressApplication;
const users = {} as Record<Name, { id: string; cookie: string }>;
const clubs = {} as Record<keyof typeof slugs, string>;
const gameId = randomUUID();

function cookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
}

function api() {
  return request(app.getHttpServer());
}

function finishedGame(clubId: string, id: string, status = 'FINISHED') {
  return {
    id,
    clubId,
    whiteId: users.ana.id,
    blackId: users.beto.id,
    challengerId: users.ana.id,
    timeKind: 'fischer',
    initialMs: 300_000,
    incrementMs: 0,
    pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
    clock: { whiteMs: 300_000, blackMs: 300_000, running: null, since: 0 },
    status: status as 'FINISHED',
    result: status === 'FINISHED' ? '1-0' : null,
    termination: status === 'FINISHED' ? 'checkmate' : null,
  };
}

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  for (const [i, name] of names.entries()) {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: emails[i], password: passwords[i], displayName: name })
      .expect(201);
    const user = await base.user.findUniqueOrThrow({
      where: { email: emails[i] },
    });
    users[name] = { id: user.id, cookie: cookie(res, ACCESS_COOKIE) };
  }

  // Ana es alumna en un club de Beto y dueña única de un club donde está sola.
  for (const key of Object.keys(slugs) as (keyof typeof slugs)[]) {
    const club = await base.club.create({
      data: { slug: slugs[key], name: `Club ${key}` },
    });
    clubs[key] = club.id;
  }
  await seedMembers(base, [
    { clubId: clubs.shared, userId: users.beto.id, role: 'Admin' },
    { clubId: clubs.shared, userId: users.ana.id, role: 'Alumno' },
    { clubId: clubs.solo, userId: users.ana.id, role: 'Admin' },
  ]);

  await base.game.create({ data: finishedGame(clubs.shared, gameId) });
  const stats = { deviation: 200, volatility: 0.06, games: 1, draws: 0 };
  await base.rating.createMany({
    data: [
      {
        clubId: clubs.shared,
        userId: users.ana.id,
        rating: 1662,
        wins: 1,
        losses: 0,
        ...stats,
      },
      {
        clubId: clubs.shared,
        userId: users.beto.id,
        rating: 1338,
        wins: 0,
        losses: 1,
        ...stats,
      },
    ],
  });
  await base.ratingChange.createMany({
    data: [
      {
        clubId: clubs.shared,
        gameId,
        userId: users.ana.id,
        opponentId: users.beto.id,
        score: 1,
        ratingBefore: 1500,
        ratingAfter: 1662,
      },
      {
        clubId: clubs.shared,
        gameId,
        userId: users.beto.id,
        opponentId: users.ana.id,
        score: 0,
        ratingBefore: 1500,
        ratingAfter: 1338,
      },
    ],
  });
  await base.fideLink.create({
    data: {
      clubId: clubs.shared,
      userId: users.ana.id,
      fideId: `9${run.replace(/\D/g, '').padEnd(6, '1').slice(0, 6)}`,
      name: 'Ana, Test',
      ratings: { standard: 1800 },
      ratingsUpdatedAt: new Date(),
      linkedBy: users.beto.id,
    },
  });
  await base.linkedAccount.create({
    data: {
      id: randomUUID(),
      userId: users.ana.id,
      platform: 'LICHESS',
      username: `ana-${run}`,
      displayName: `Ana-${run}`,
      verifiedAt: new Date(),
      ratings: { blitz: 1700 },
    },
  });
  await base.importedGame.create({
    data: {
      id: randomUUID(),
      clubId: clubs.shared,
      platform: 'LICHESS',
      externalId: `ext-${run}`,
      url: `https://lichess.org/ext${run}`,
      whiteName: `ana-${run}`,
      blackName: `beto-${run}`,
      whiteUserId: users.ana.id,
      blackUserId: users.beto.id,
      result: '1/2-1/2',
      speed: 'blitz',
      standard: true,
      pgn: '1. d4 d5 1/2-1/2',
      playedAt: new Date(),
      importedBy: users.ana.id,
    },
  });
});

afterAll(async () => {
  await app.close();
  await base.club.deleteMany({ where: { slug: { in: Object.values(slugs) } } });
  await base.user.deleteMany({
    where: { id: { in: names.map((n) => users[n]?.id).filter(Boolean) } },
  });
  await base.$disconnect();
});

function deleteAccount(name: Name, password: string) {
  return api()
    .delete('/api/auth/account')
    .set('Cookie', users[name].cookie)
    .send({ password });
}

describe('descargar mis datos', () => {
  it('pide sesión', async () => {
    await api().get('/api/auth/account/export').expect(401);
  });

  it('trae la cuenta, las cuentas vinculadas y lo de cada club, como archivo', async () => {
    const res = await api()
      .get('/api/auth/account/export')
      .set('Cookie', users.ana.cookie)
      .expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.account).toMatchObject({
      id: users.ana.id,
      email: emails[0],
      displayName: 'ana',
    });
    expect(res.body.account).not.toHaveProperty('passwordHash');
    expect(res.body.linkedAccounts).toEqual([
      expect.objectContaining({ platform: 'lichess', username: `ana-${run}` }),
    ]);

    const shared = res.body.clubs.find(
      (c: { club: { slug: string } }) => c.club.slug === slugs.shared,
    );
    expect(shared).toMatchObject({
      role: 'Alumno',
      rating: { rating: 1662, games: 1, wins: 1 },
      ratingHistory: [{ gameId, opponent: 'beto', ratingAfter: 1662 }],
      fide: { name: 'Ana, Test' },
      games: [
        {
          id: gameId,
          color: 'white',
          opponent: 'beto',
          result: '1-0',
          status: 'finished',
        },
      ],
      importedGames: [{ platform: 'lichess', speed: 'blitz' }],
    });
    expect(res.body.clubs).toHaveLength(2);
  });
});

describe('eliminar la cuenta', () => {
  it('pide la contraseña correcta', async () => {
    await deleteAccount('ana', 'otra-contraseña').expect(401);
    await api()
      .delete('/api/auth/account')
      .set('Cookie', users.ana.cookie)
      .send({})
      .expect(400);
  });

  it('no deja con una partida en curso', async () => {
    const live = randomUUID();
    await base.game.create({
      data: finishedGame(clubs.shared, live, 'IN_PROGRESS'),
    });
    try {
      const res = await deleteAccount('ana', passwords[0]).expect(409);
      expect(res.body.code).toBe('GAME_IN_PROGRESS');
    } finally {
      await base.game.delete({ where: { id: live } });
    }
  });

  it('el único dueño de un club con más miembros tiene que nombrar a otro antes', async () => {
    const res = await deleteAccount('beto', passwords[1]).expect(409);
    expect(res.body).toMatchObject({
      code: 'LAST_OWNER',
      clubs: [{ slug: slugs.shared }],
    });
    const beto = await base.user.findUniqueOrThrow({
      where: { id: users.beto.id },
    });
    expect(beto.email).toBe(emails[1]);
  });

  it('un club donde está sola con el plan Pro activo se cancela antes', async () => {
    await base.subscription.create({
      data: {
        clubId: clubs.solo,
        provider: 'mercadopago',
        providerSubscriptionId: `pre-${run}`,
        status: 'active',
        payerEmail: emails[0],
      },
    });
    try {
      const res = await deleteAccount('ana', passwords[0]).expect(409);
      expect(res.body).toMatchObject({
        code: 'SUBSCRIPTION_ACTIVE',
        clubs: [{ slug: slugs.solo }],
      });
      // Nada cambió.
      expect(
        await base.membership.count({ where: { userId: users.ana.id } }),
      ).toBe(2);
    } finally {
      await base.subscription.delete({ where: { clubId: clubs.solo } });
    }
  });

  it('borra sus datos y deja anónimas sus partidas para los rivales', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: emails[0], password: passwords[0] })
      .expect(200);
    const refresh = cookie(login, REFRESH_COOKIE);

    const res = await deleteAccount('ana', passwords[0]).expect(204);
    expect(cookie(res, ACCESS_COOKIE)).toBe(`${ACCESS_COOKIE}=`);

    const ana = await base.user.findUniqueOrThrow({
      where: { id: users.ana.id },
    });
    expect(ana.displayName).toBe(DELETED_NAME);
    expect(ana.email).not.toContain('ana');
    expect(ana.emailVerifiedAt).toBeNull();

    // No queda nada suyo.
    const where = { userId: users.ana.id };
    expect(await base.membership.count({ where })).toBe(0);
    expect(await base.rating.count({ where })).toBe(0);
    expect(await base.ratingChange.count({ where })).toBe(0);
    expect(await base.fideLink.count({ where })).toBe(0);
    expect(await base.linkedAccount.count({ where })).toBe(0);
    expect(await base.refreshToken.count({ where })).toBe(0);
    expect(
      await base.importedGame.count({
        where: { OR: [{ whiteUserId: ana.id }, { blackUserId: ana.id }] },
      }),
    ).toBe(0);
    // El club donde estaba sola se fue con ella.
    expect(await base.club.count({ where: { id: clubs.solo } })).toBe(0);

    // Para Beto, la partida y su historial siguen, contra "Cuenta eliminada".
    const game = await api()
      .get(`/api/club/games/${gameId}`)
      .set('Cookie', users.beto.cookie)
      .set('Host', `${slugs.shared}.localhost`)
      .expect(200);
    expect(game.body.pgn).toContain('Qxf7#');
    expect(
      await base.ratingChange.count({
        where: { userId: users.beto.id, opponentId: ana.id },
      }),
    ).toBe(1);

    // Ya no entra ni con la contraseña ni con la sesión que tenía.
    await api()
      .post('/api/auth/login')
      .send({ email: emails[0], password: passwords[0] })
      .expect(401);
    await api().post('/api/auth/refresh').set('Cookie', refresh).expect(401);
  });
});
