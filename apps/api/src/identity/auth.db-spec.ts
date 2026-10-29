import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const email = `auth-${randomUUID().slice(0, 8)}@test.local`;
// Credenciales de prueba generadas en cada corrida.
const secret = randomUUID();
const wrongSecret = randomUUID();
const shortSecret = secret.slice(0, 5);
let app: NestExpressApplication;

/** Saca el valor de una cookie de los headers Set-Cookie. */
function cookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1) ?? '';
}

function post(path: string) {
  return request(app.getHttpServer()).post(`/api/auth/${path}`);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await base.user.deleteMany({ where: { email: { contains: email } } });
  await base.$disconnect();
  await app.close();
});

describe('auth', () => {
  let refreshToken: string;
  let accessToken: string;

  it('registra y deja la sesión en cookies httpOnly', async () => {
    const res = await post('register')
      .send({
        email: email.toUpperCase(),
        password: secret,
        displayName: 'Ana',
      })
      .expect(201);

    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(
      '\n',
    );
    expect(setCookie).toMatch(/oc_at=[^;]+;.*HttpOnly/);
    expect(setCookie).toMatch(/oc_rt=[^;]+;.*Path=\/api\/auth/);

    const user = await base.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rechaza una contraseña corta', async () => {
    await post('register')
      .send({ email: `otro-${email}`, password: shortSecret, displayName: 'X' })
      .expect(400);
  });

  it('da el mismo error con contraseña mala y con email inexistente', async () => {
    const wrong = await post('login')
      .send({ email, password: wrongSecret })
      .expect(401);
    const unknown = await post('login')
      .send({ email: `nadie-${email}`, password: secret })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('inicia sesión y /me devuelve al usuario', async () => {
    const res = await post('login')
      .send({ email, password: secret })
      .expect(200);
    accessToken = cookie(res, ACCESS_COOKIE);
    refreshToken = cookie(res, REFRESH_COOKIE);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${ACCESS_COOKIE}=${accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, displayName: 'Ana' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('/me sin cookie o con un token alterado responde 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `${ACCESS_COOKIE}=${accessToken.slice(0, -2)}xx`)
      .expect(401);
  });

  it('rota el refresh y, si reusan el viejo, revoca toda la familia', async () => {
    const rotated = await post('refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(200);
    const newRefresh = cookie(rotated, REFRESH_COOKIE);
    expect(newRefresh).not.toBe('');
    expect(newRefresh).not.toBe(refreshToken);

    // Alguien reusa el token viejo (por ejemplo, uno robado)
    await post('refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${refreshToken}`)
      .expect(401);

    // El token nuevo también quedó revocado
    await post('refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${newRefresh}`)
      .expect(401);
  });

  it('una cookie de refresh con prefijo "j:" responde 401, no 500', async () => {
    await post('refresh')
      .set('Cookie', `${REFRESH_COOKIE}=j:{"a":1}`)
      .expect(401);
    await post('logout')
      .set('Cookie', `${REFRESH_COOKIE}=j:{"a":1}`)
      .expect(204);
  });

  it('un hash guardado que no es argon2 cuenta como contraseña incorrecta', async () => {
    const broken = `roto-${email}`;
    await base.user.create({
      data: { email: broken, displayName: 'Roto', passwordHash: 'x' },
    });
    try {
      await post('login').send({ email: broken, password: secret }).expect(401);
    } finally {
      await base.user.delete({ where: { email: broken } });
    }
  });

  it('dos registros simultáneos con el mismo email: uno entra y el otro da 409', async () => {
    const dup = `dup-${email}`;
    try {
      const statuses = await Promise.all(
        [0, 1].map(async () =>
          post('register')
            .send({ email: dup, password: secret, displayName: 'Dup' })
            .then((r) => r.status),
        ),
      );
      expect(statuses.sort()).toEqual([201, 409]);
    } finally {
      await base.user.deleteMany({ where: { email: dup } });
    }
  });

  it('si dos requests rotan el mismo refresh a la vez, solo una gana y la familia cae', async () => {
    const res = await post('login')
      .send({ email, password: secret })
      .expect(200);
    const rt = cookie(res, REFRESH_COOKIE);

    const [a, b] = await Promise.all(
      [0, 1].map(() =>
        post('refresh').set('Cookie', `${REFRESH_COOKIE}=${rt}`),
      ),
    );
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    const winner = a.status === 200 ? a : b;
    await post('refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${cookie(winner, REFRESH_COOKIE)}`)
      .expect(401);
  });

  it('logout revoca la sesión', async () => {
    const res = await post('login')
      .send({ email, password: secret })
      .expect(200);
    const rt = cookie(res, REFRESH_COOKIE);

    await post('logout').set('Cookie', `${REFRESH_COOKIE}=${rt}`).expect(204);
    await post('refresh').set('Cookie', `${REFRESH_COOKIE}=${rt}`).expect(401);
  });
});
