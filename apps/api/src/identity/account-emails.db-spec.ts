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
const run = randomUUID().slice(0, 8);
const email = `mail-${run}@test.local`;
const password = randomUUID();
const newPassword = randomUUID();

/** Doble del proveedor: guarda los emails en vez de mandarlos. */
const sent: Email[] = [];
const mailer: Mailer = { send: async (e) => void sent.push(e) };

let app: NestExpressApplication;

/** El token del último email con ese asunto, sacado del link. */
async function lastToken(subject: string): Promise<string> {
  await app.get(AccountEmailsService).idle();
  const mail = [...sent].reverse().find((e) => e.subject.includes(subject));
  const match = mail?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No llegó el email "${subject}"`);
  return match[1];
}

function cookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
}

function post(path: string) {
  return request(app.getHttpServer()).post(`/api/auth/${path}`);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await base.user.deleteMany({ where: { email } });
  await base.$disconnect();
});

describe('emails de la cuenta', () => {
  let session: string;

  it('al registrarse llega el link para confirmar el email, y sirve una sola vez', async () => {
    const res = await post('register')
      .send({ email, password, displayName: 'Ana' })
      .expect(201);
    session = cookie(res, ACCESS_COOKIE);

    const me = () =>
      request(app.getHttpServer()).get('/api/auth/me').set('Cookie', session);
    expect((await me().expect(200)).body.emailVerified).toBe(false);

    const token = await lastToken('Confirma tu email');
    expect(sent.at(-1)?.to).toBe(email);
    expect(sent.at(-1)?.text).toContain(
      'http://localhost:3000/verificar?token=',
    );

    await post('verify-email').send({ token }).expect(204);
    expect((await me().expect(200)).body.emailVerified).toBe(true);
    await post('verify-email').send({ token }).expect(400);
  });

  it('un token inventado o de otro tipo no sirve', async () => {
    await post('verify-email')
      .send({ token: 'x'.repeat(43) })
      .expect(400);
  });

  it('olvidé mi contraseña responde igual exista o no la cuenta', async () => {
    const before = sent.length;
    await post('forgot-password')
      .send({ email: `nadie-${email}` })
      .expect(204);
    await app.get(AccountEmailsService).idle();
    expect(sent.length).toBe(before);

    await post('forgot-password').send({ email }).expect(204);
    await lastToken('Cambia tu contraseña');
  });

  it('cambiar la contraseña con el link cierra todas las sesiones', async () => {
    const login = await post('login').send({ email, password }).expect(200);
    const refresh = cookie(login, REFRESH_COOKIE);

    // Pedir otro link deja sin efecto el anterior.
    const old = await lastToken('Cambia tu contraseña');
    await post('forgot-password').send({ email }).expect(204);
    const token = await lastToken('Cambia tu contraseña');
    await post('reset-password')
      .send({ token: old, password: newPassword })
      .expect(400);

    await post('reset-password').send({ token, password: 'corta' }).expect(400);
    await post('reset-password')
      .send({ token, password: newPassword })
      .expect(204);

    await post('refresh').set('Cookie', refresh).expect(401);
    await post('login').send({ email, password }).expect(401);
    await post('login').send({ email, password: newPassword }).expect(200);
    await post('reset-password')
      .send({ token, password: randomUUID() })
      .expect(400);
  });

  it('un link vencido no sirve', async () => {
    await post('forgot-password').send({ email }).expect(204);
    const token = await lastToken('Cambia tu contraseña');
    await base.emailToken.updateMany({
      where: { user: { email }, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await post('reset-password')
      .send({ token, password: randomUUID() })
      .expect(400);
  });
});
