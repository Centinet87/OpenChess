import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient } from '@openchess/database';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { seedMembers } from '../../../testing/seed-members';
import { AppModule } from '../../app.module';
import { ACCESS_COOKIE } from '../../auth/api/cookies/session.cookies';
import { configureApp } from '../../configure-app';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slug = `race-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
const emails = names.map((n) => `${n}-${run}@test.local`);

let app: NestExpressApplication;
let clubId: string;
const users = {} as Record<
  (typeof names)[number],
  { id: string; cookie: string }
>;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  for (const [i, name] of names.entries()) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: emails[i], password: randomUUID(), displayName: name })
      .expect(201);
    const raw = res.headers['set-cookie'] as unknown as string[];
    const user = await base.user.findUniqueOrThrow({
      where: { email: emails[i] },
    });
    users[name] = {
      id: user.id,
      cookie:
        raw.find((c) => c.startsWith(`${ACCESS_COOKIE}=`))?.split(';')[0] ?? '',
    };
  }
  clubId = (await base.club.create({ data: { slug, name: 'Carreras' } })).id;
});

afterAll(async () => {
  await app.close();
  await base.club.deleteMany({ where: { slug } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
});

async function owners(): Promise<number> {
  return base.membership.count({
    where: { clubId, role: { isOwner: true } },
  });
}

describe('el club siempre tiene un dueño', () => {
  it('la base de datos no deja sacar al último dueño, aunque se salte la API', async () => {
    await seedMembers(base, [{ clubId, userId: users.ana.id, role: 'Admin' }]);
    await expect(
      base.membership.delete({
        where: { clubId_userId: { clubId, userId: users.ana.id } },
      }),
    ).rejects.toThrow('LAST_OWNER');

    const alumno = await base.clubRole.findFirstOrThrow({
      where: { clubId, name: 'Alumno' },
    });
    await expect(
      base.membership.update({
        where: { clubId_userId: { clubId, userId: users.ana.id } },
        data: { roleId: alumno.id },
      }),
    ).rejects.toThrow('LAST_OWNER');
    expect(await owners()).toBe(1);
  });

  it('si los dos dueños se van a la vez, uno se queda', async () => {
    await seedMembers(base, [{ clubId, userId: users.beto.id, role: 'Admin' }]);
    expect(await owners()).toBe(2);

    const statuses = await Promise.all(
      (['ana', 'beto'] as const).map((name) =>
        request(app.getHttpServer())
          .delete(`/api/club/members/${users[name].id}`)
          .set('Cookie', users[name].cookie)
          .set('Host', `${slug}.localhost`)
          .then((r) => ({ status: r.status, code: r.body.code })),
      ),
    );
    expect(statuses.map((s) => s.status).sort()).toEqual([204, 409]);
    expect(statuses.find((s) => s.status === 409)?.code).toBe('LAST_OWNER');
    expect(await owners()).toBe(1);
  });
});

describe('invitaciones', () => {
  it('si alguien acepta dos invitaciones a la vez, entra una sola vez', async () => {
    const owner = (await base.membership.findFirstOrThrow({
      where: { clubId, role: { isOwner: true } },
      select: { userId: true },
    })) as { userId: string };
    const ownerName = names.find((n) => users[n].id === owner.userId);
    if (!ownerName) throw new Error('El club no tiene dueño');
    const alumno = await base.clubRole.findFirstOrThrow({
      where: { clubId, name: 'Alumno' },
    });

    const tokens: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/club/invitations')
        .set('Cookie', users[ownerName].cookie)
        .set('Host', `${slug}.localhost`)
        .send({ roleId: alumno.id })
        .expect(201);
      tokens.push(res.body.token);
    }

    const results = await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post('/api/club/invitations/accept')
          .set('Cookie', users.caro.cookie)
          .set('Host', `${slug}.localhost`)
          .send({ token })
          .then((r) => ({ status: r.status, code: r.body.code })),
      ),
    );
    // Nunca un 500: o entra, o ya es miembro.
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.code).toBe('ALREADY_MEMBER');
    expect(
      await base.membership.count({ where: { clubId, userId: users.caro.id } }),
    ).toBe(1);
  });
});

describe('tope del plan gratis', () => {
  const full = `lleno-${run}`;
  const fillerEmails: string[] = [];

  afterAll(async () => {
    await base.club.deleteMany({ where: { slug: full } });
    await base.user.deleteMany({ where: { email: { in: fillerEmails } } });
  });

  it('con un lugar libre y dos invitaciones aceptadas a la vez, entra una sola persona', async () => {
    const club = await base.club.create({
      data: { slug: full, name: 'Lleno' },
    });
    // Dueña y 13 de relleno: 14 de los 15 del plan gratis.
    const filler = [];
    for (let i = 0; i < 13; i++) {
      const email = `relleno-${i}-${run}@test.local`;
      fillerEmails.push(email);
      filler.push(
        await base.user.create({
          data: { email, passwordHash: 'x', displayName: `R${i}` },
        }),
      );
    }
    await seedMembers(base, [
      { clubId: club.id, userId: users.ana.id, role: 'Admin' },
      ...filler.map((u) => ({
        clubId: club.id,
        userId: u.id,
        role: 'Alumno' as const,
      })),
    ]);
    const alumno = await base.clubRole.findFirstOrThrow({
      where: { clubId: club.id, name: 'Alumno' },
    });

    const tokens: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/club/invitations')
        .set('Cookie', users.ana.cookie)
        .set('Host', `${full}.localhost`)
        .send({ roleId: alumno.id })
        .expect(201);
      tokens.push(res.body.token);
    }

    const results = await Promise.all(
      (['beto', 'caro'] as const).map((name, i) =>
        request(app.getHttpServer())
          .post('/api/club/invitations/accept')
          .set('Cookie', users[name].cookie)
          .set('Host', `${full}.localhost`)
          .send({ token: tokens[i] })
          .then((r) => ({ status: r.status, code: r.body.code })),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 402]);
    expect(results.find((r) => r.status === 402)?.code).toBe('MEMBER_LIMIT');
    expect(await base.membership.count({ where: { clubId: club.id } })).toBe(
      15,
    );
  });
});
