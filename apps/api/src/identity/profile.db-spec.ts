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

describe('cambiar el email', () => {
  const run = randomUUID().slice(0, 8);
  const before = `antes-${run}@test.local`;
  const after = `despues-${run}@test.local`;
  const taken = `ocupado-${run}@test.local`;
  const secret = randomUUID();
  let access: string;

  /** El token del último link para confirmar un email nuevo que llegó a esa dirección. */
  async function tokenSentTo(to: string): Promise<string | undefined> {
    await app.get(AccountEmailsService).idle();
    const mail = [...sent]
      .reverse()
      .find((e) => e.to === to && e.subject.includes('nuevo email'));
    return mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  }

  function changeEmail(newEmail: string, pass = secret) {
    return api()
      .post('/api/auth/change-email')
      .set('Cookie', access)
      .send({ password: pass, newEmail });
  }

  beforeAll(async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: before, password: secret, displayName: 'Beto' })
      .expect(201);
    access = cookie(res, ACCESS_COOKIE);
    await api()
      .post('/api/auth/register')
      .send({ email: taken, password: randomUUID(), displayName: 'Otro' })
      .expect(201);
  });

  afterAll(async () => {
    await base.user.deleteMany({
      where: { email: { in: [before, after, taken] } },
    });
  });

  // change-email admite 5 intentos por minuto: entre todos los tests son 5.
  it('pide la contraseña y un email distinto del actual', async () => {
    await changeEmail(after, randomUUID()).expect(401);
    await changeEmail(before.toUpperCase()).expect(400);
  });

  it('si el email nuevo ya tiene cuenta responde igual, pero no le manda nada', async () => {
    await changeEmail(taken).expect(204);
    expect(await tokenSentTo(taken)).toBeUndefined();
  });

  it('el cambio se hace al usar el link que llega al email nuevo', async () => {
    await changeEmail(after).expect(204);
    const token = await tokenSentTo(after);
    expect(token).toBeDefined();
    // Hasta confirmar, la cuenta sigue con el email de antes.
    const pending = await api()
      .get('/api/auth/me')
      .set('Cookie', access)
      .expect(200);
    expect(pending.body.email).toBe(before);

    await api()
      .post('/api/auth/confirm-email-change')
      .send({ token })
      .expect(204);
    const me = await api()
      .get('/api/auth/me')
      .set('Cookie', access)
      .expect(200);
    expect(me.body).toMatchObject({ email: after, emailVerified: true });

    // Al email de antes le llega el aviso.
    await app.get(AccountEmailsService).idle();
    expect(sent.at(-1)).toMatchObject({
      to: before,
      subject: expect.stringContaining('email'),
    });

    // El link sirve una sola vez, y se entra con el email nuevo.
    await api()
      .post('/api/auth/confirm-email-change')
      .send({ token })
      .expect(400);
    await api()
      .post('/api/auth/login')
      .send({ email: before, password: secret })
      .expect(401);
    await api()
      .post('/api/auth/login')
      .send({ email: after, password: secret })
      .expect(200);
  });

  it('si otra cuenta tomó el email antes de confirmar, responde EMAIL_TAKEN', async () => {
    const latecomer = `tarde-${run}@test.local`;
    await changeEmail(latecomer).expect(204);
    const token = await tokenSentTo(latecomer);
    await api()
      .post('/api/auth/register')
      .send({ email: latecomer, password: randomUUID(), displayName: 'Tarde' })
      .expect(201);
    try {
      const res = await api()
        .post('/api/auth/confirm-email-change')
        .send({ token })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    } finally {
      await base.user.deleteMany({ where: { email: latecomer } });
    }
  });
});
