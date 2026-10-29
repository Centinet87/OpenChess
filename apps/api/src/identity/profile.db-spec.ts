import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { AccountEmailsService } from './account-emails.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';
import { MAILER, type Email, type Mailer } from './mailer';

config({ path: '../../.env', quiet: true });

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const email = `perfil-${randomUUID().slice(0, 8)}@test.local`;
const password = randomUUID();
const newPassword = randomUUID();
let app: NestExpressApplication;

/** Doble del proveedor: guarda los emails en vez de mandarlos. */
const sent: Email[] = [];
const mailer: Mailer = { send: async (e) => void sent.push(e) };

function cookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
}

function api() {
  return request(app.getHttpServer());
}

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile()
  ).createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await base.user.deleteMany({ where: { email } });
  await base.$disconnect();
});

describe('mi cuenta', () => {
  let session: { access: string; refresh: string };

  beforeAll(async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email, password, displayName: 'Ana' })
      .expect(201);
    session = {
      access: cookie(res, ACCESS_COOKIE),
      refresh: cookie(res, REFRESH_COOKIE),
    };
  });

  it('cambia el nombre visible', async () => {
    const res = await api()
      .patch('/api/auth/me')
      .set('Cookie', session.access)
      .send({ displayName: '  Ana María  ' })
      .expect(200);
    expect(res.body).toMatchObject({ email, displayName: 'Ana María' });

    await api()
      .patch('/api/auth/me')
      .set('Cookie', session.access)
      .send({ displayName: '   ' })
      .expect(400);
    await api().patch('/api/auth/me').send({ displayName: 'X' }).expect(401);
  });

  it('cambia la contraseña sabiendo la actual y cierra las otras sesiones', async () => {
    const other = await api()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    await api()
      .post('/api/auth/change-password')
      .set('Cookie', session.access)
      .send({ currentPassword: randomUUID(), newPassword })
      .expect(401);
    await api()
      .post('/api/auth/change-password')
      .set('Cookie', session.access)
      .send({ currentPassword: password, newPassword: 'corta' })
      .expect(400);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Cookie', session.access)
      .send({ currentPassword: password, newPassword })
      .expect(204);
    // Llega el aviso al email de la cuenta.
    await app.get(AccountEmailsService).idle();
    expect(sent.at(-1)).toMatchObject({
      to: email,
      subject: expect.stringContaining('contraseña'),
    });

    // Esta sesión sigue, con cookies nuevas.
    const refresh = cookie(res, REFRESH_COOKIE);
    expect(refresh).not.toBe(session.refresh);
    await api().post('/api/auth/refresh').set('Cookie', refresh).expect(200);

    // Las demás ya no se renuevan.
    for (const old of [session.refresh, cookie(other, REFRESH_COOKIE)]) {
      await api().post('/api/auth/refresh').set('Cookie', old).expect(401);
    }

    await api().post('/api/auth/login').send({ email, password }).expect(401);
    await api()
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });
});
