import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { ACCESS_COOKIE } from '../auth/infrastructure/http/cookies';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slug = `reuso-${run}`;
const emails = ['primera', 'segunda'].map((n) => `${n}-${run}@test.local`);
const password = randomUUID();
let app: NestExpressApplication;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await base.club.deleteMany({ where: { slug } });
  await base.user.deleteMany({ where: { email: { contains: run } } });
  await base.$disconnect();
});

async function register(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password, displayName: 'X' })
    .expect(201);
  const raw = res.headers['set-cookie'] as unknown as string[];
  return (
    raw.find((c) => c.startsWith(`${ACCESS_COOKIE}=`))?.split(';')[0] ?? ''
  );
}

function clubMe(cookie: string) {
  return request(app.getHttpServer())
    .get('/api/club/me')
    .set('Cookie', cookie)
    .set('Host', `${slug}.localhost`);
}

it('un subdominio que se libera y se vuelve a usar apunta enseguida al club nuevo', async () => {
  const [first, second] = [
    await register(emails[0]),
    await register(emails[1]),
  ];
  // Antes de existir: "no existe" queda en la caché.
  await clubMe(second).expect(404);

  await request(app.getHttpServer())
    .post('/api/clubs')
    .set('Cookie', first)
    .send({ slug, name: 'Primero' })
    .expect(201);
  await clubMe(first).expect(200);

  // Estaba sola: al eliminar su cuenta, el club se borra y el subdominio queda libre.
  await request(app.getHttpServer())
    .delete('/api/auth/account')
    .set('Cookie', first)
    .send({ password })
    .expect(204);
  await request(app.getHttpServer())
    .post('/api/clubs')
    .set('Cookie', second)
    .send({ slug, name: 'Segundo' })
    .expect(201);

  const me = await clubMe(second).expect(200);
  expect(me.body).toMatchObject({ isOwner: true });
});
