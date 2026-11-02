import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient } from '@openchess/database';
import { config } from 'dotenv';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { seedMembers } from '../../../testing/seed-members';
import { AppModule } from '../../app.module';
import { ACCESS_COOKIE } from '../../auth/api/cookies/session.cookies';
import { configureApp } from '../../configure-app';
import { RatingsUseCases } from '../../ratings/application/use-cases/ratings.use-cases';
import type { FideDirectory } from '../application/repositories/linked-accounts.ports';
import type { FideProfile } from '../domain/entities/fide';
import { FIDE_DIRECTORY } from '../linked-accounts.module';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `fa-${run}`;
const slugB = `fb-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);

/** Doble de ratings.fide.com. */
const profiles = new Map<string, FideProfile>([
  [
    '3400000',
    {
      fideId: '3400000',
      name: 'Pérez, Beto',
      federation: 'Chile',
      title: null,
      ratings: { standard: 2100, rapid: 2050 },
    },
  ],
]);
const directory: FideDirectory = {
  profile: async (id) => profiles.get(id) ?? null,
};

let app: NestExpressApplication;
let clubAId: string;
const users = {} as Record<Name, { id: string; cookie: string }>;

function as(name: Name, slug: string) {
  const prep = (r: request.Test) =>
    r.set('Cookie', users[name].cookie).set('Host', `${slug}.localhost`);
  const agent = request(app.getHttpServer());
  return {
    get: (p: string) => prep(agent.get(`/api${p}`)),
    put: (p: string) => prep(agent.put(`/api${p}`)),
    delete: (p: string) => prep(agent.delete(`/api${p}`)),
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FIDE_DIRECTORY)
    .useValue(directory)
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

  // Club A: ana (admin) y beto. Club B: solo caro.
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
  await app.close();
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

describe('Elo FIDE', () => {
  it('el propio miembro no puede asignarse un FIDE ID; el admin sí', async () => {
    const own = await as('beto', slugA)
      .put(`/club/fide/${users.beto.id}`)
      .send({ fideId: '3400000' })
      .expect(403);
    expect(own.body.code).toBe('FORBIDDEN');

    const res = await as('ana', slugA)
      .put(`/club/fide/${users.beto.id}`)
      .send({ fideId: '3400000' })
      .expect(200);
    expect(res.body).toMatchObject({
      userId: users.beto.id,
      fideId: '3400000',
      name: 'Pérez, Beto',
      federation: 'Chile',
      ratings: { standard: 2100, rapid: 2050 },
      url: 'https://ratings.fide.com/profile/3400000',
    });
  });

  it('los miembros lo ven; otro club no', async () => {
    await as('beto', slugA).get(`/club/fide/${users.beto.id}`).expect(200);
    const list = await as('beto', slugA).get('/club/fide').expect(200);
    expect(list.body).toHaveLength(1);

    expect(
      (await as('caro', slugB).get('/club/fide').expect(200)).body,
    ).toEqual([]);
    await as('caro', slugA).get('/club/fide').expect(403);
  });

  it('valida el FIDE ID, que exista y que no esté asignado a otro miembro', async () => {
    const bad = await as('ana', slugA)
      .put(`/club/fide/${users.ana.id}`)
      .send({ fideId: 'abc' })
      .expect(400);
    expect(bad.body.code).toBe('INVALID_FIDE_ID');
    await as('ana', slugA)
      .put(`/club/fide/${users.ana.id}`)
      .send({ fideId: '999' })
      .expect(404);
    const dup = await as('ana', slugA)
      .put(`/club/fide/${users.ana.id}`)
      .send({ fideId: '3400000' })
      .expect(409);
    expect(dup.body.code).toBe('ALREADY_LINKED');
    // Quien no es del club
    await as('ana', slugA)
      .put(`/club/fide/${users.caro.id}`)
      .send({ fideId: '3400000' })
      .expect(404);
  });

  it('en el ranking del club, quien tiene Elo FIDE parte con ese rating', async () => {
    const before = await as('ana', slugA)
      .get(`/club/ratings/${users.beto.id}`)
      .expect(200);
    expect(before.body).toMatchObject({
      rating: 2100,
      deviation: 150,
      games: 0,
    });

    // Beto (2100) le gana a Ana (1500, sin Elo FIDE).
    const cls = app.get(ClsService);
    await cls.run(async () => {
      cls.set('clubId', clubAId);
      await app.get(RatingsUseCases).recordGame({
        gameId: randomUUID(),
        clubId: clubAId,
        whiteId: users.beto.id,
        blackId: users.ana.id,
        result: '1-0',
      });
    });
    const standings = await as('ana', slugA).get('/club/ratings').expect(200);
    expect(standings.body[0]).toMatchObject({ userId: users.beto.id });
    expect(standings.body[0].rating).toBeGreaterThanOrEqual(2100);
    expect(standings.body[1].rating).toBeLessThan(1500);
  });

  it('el admin lo puede quitar', async () => {
    await as('beto', slugA).delete(`/club/fide/${users.beto.id}`).expect(403);
    await as('ana', slugA).delete(`/club/fide/${users.beto.id}`).expect(204);
    await as('ana', slugA).get(`/club/fide/${users.beto.id}`).expect(404);
  });
});
