import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../identity/cookies';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `a-${run}`;
const slugB = `b-${run}`;
const emails = ['ana', 'beto', 'caro'].map((n) => `${n}-${run}@test.local`);
let app: NestExpressApplication;

interface TestUser {
  id: string;
  cookie: string;
}
const users: Record<'ana' | 'beto' | 'caro', TestUser> = {} as never;

/** Request con la sesión del usuario y, si se indica, desde el subdominio de un club. */
function as(user: TestUser, slug?: string) {
  const host = slug ? `${slug}.localhost` : 'localhost';
  const agent = request(app.getHttpServer());
  const withAuth = (r: request.Test) =>
    r.set('Cookie', user.cookie).set('Host', host);
  return {
    get: (path: string) => withAuth(agent.get(`/api${path}`)),
    post: (path: string) => withAuth(agent.post(`/api${path}`)),
    patch: (path: string) => withAuth(agent.patch(`/api${path}`)),
    delete: (path: string) => withAuth(agent.delete(`/api${path}`)),
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  for (const [i, name] of (['ana', 'beto', 'caro'] as const).entries()) {
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
});

afterAll(async () => {
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
  await app.close();
});

describe('clubes', () => {
  let invitationToken: string;

  it('crear un club deja al creador como OWNER', async () => {
    await as(users.ana)
      .post('/clubs')
      .send({ slug: slugA, name: 'Club A' })
      .expect(201);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: slugB, name: 'Club B' })
      .expect(201);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: slugA, name: 'Copia' })
      .expect(409);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: 'api', name: 'Reservado' })
      .expect(400);

    const mine = await as(users.ana).get('/clubs/mine').expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({ slug: slugA, role: 'OWNER' }),
    ]);
  });

  it('solo los miembros ven el club, y un subdominio inexistente da 404', async () => {
    const res = await as(users.ana, slugA).get('/club/members').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        userId: users.ana.id,
        role: 'OWNER',
        displayName: 'ana',
      }),
    ]);

    await as(users.ana, slugB).get('/club/members').expect(403);
    await as(users.ana, `nada-${run}`).get('/club/members').expect(404);
  });

  it('un token de invitación del club A no sirve en el club B', async () => {
    const res = await as(users.ana, slugA)
      .post('/club/invitations')
      .send({ role: 'COACH' })
      .expect(201);
    invitationToken = res.body.token;

    await as(users.caro, slugB)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(404);
  });

  it('la invitación se acepta una sola vez', async () => {
    const res = await as(users.caro, slugA)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(200);
    expect(res.body).toEqual({ role: 'COACH' });

    await as(users.beto, slugA)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(409);
  });

  it('un COACH invita alumnos pero no profesores, ni cambia roles', async () => {
    await as(users.caro, slugA)
      .post('/club/invitations')
      .send({ role: 'STUDENT' })
      .expect(201);
    await as(users.caro, slugA)
      .post('/club/invitations')
      .send({ role: 'COACH' })
      .expect(403);
    await as(users.caro, slugA)
      .patch(`/club/members/${users.ana.id}`)
      .send({ role: 'STUDENT' })
      .expect(403);
  });

  it('el club no se queda sin OWNER', async () => {
    await as(users.ana, slugA)
      .patch(`/club/members/${users.ana.id}`)
      .send({ role: 'COACH' })
      .expect(409);
  });

  it('el OWNER de otro club no puede sacar miembros de este', async () => {
    await as(users.beto, slugA)
      .delete(`/club/members/${users.caro.id}`)
      .expect(403);
  });

  it('el OWNER saca a un miembro', async () => {
    await as(users.ana, slugA)
      .delete(`/club/members/${users.caro.id}`)
      .expect(204);
    const res = await as(users.ana, slugA).get('/club/members').expect(200);
    expect(res.body.map((m: { userId: string }) => m.userId)).toEqual([
      users.ana.id,
    ]);
  });
});
