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
const slug = `own-${run}`;
const names = ['ana', 'beto'] as const;
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
  clubId = (await base.club.create({ data: { slug, name: 'Dueños' } })).id;
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
      names.map((name) =>
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
