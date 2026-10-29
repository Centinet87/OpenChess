import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../identity/cookies';
import { seedMembers } from '../testing/seed-members';

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
