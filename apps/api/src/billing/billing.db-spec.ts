import { createHmac, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  FREE_MEMBER_LIMIT,
  type PaymentGateway,
  type ProviderSubscription,
} from '@openchess/billing';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../identity/cookies';
import { seedMembers } from '../testing/seed-members';
import { PAYMENT_GATEWAY } from './billing.module';

config({ path: '../../.env', quiet: true });
// La API valida la firma de los webhooks solo si hay clave.
const WEBHOOK_SECRET = 'clave-de-prueba';
process.env['MP_WEBHOOK_SECRET'] = WEBHOOK_SECRET;

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slug = `bill-${run}`;
const names = ['ana', 'beto', 'caro'] as const;
type Name = (typeof names)[number];
const emails = names.map((n) => `${n}-${run}@test.local`);
const fillerEmails: string[] = [];

/** Doble de Mercado Pago. */
class FakeGateway implements PaymentGateway {
  readonly provider = 'mercadopago';
  remote = new Map<string, ProviderSubscription>();
  backUrls: string[] = [];
  async createSubscription(input: {
    clubId: string;
    payerEmail: string;
    backUrl: string;
  }) {
    this.backUrls.push(input.backUrl);
    const subscription: ProviderSubscription = {
      id: `pre-${run}-${this.remote.size + 1}`,
      status: 'pending',
      clubId: input.clubId,
      payerEmail: input.payerEmail,
      nextPaymentAt: null,
    };
    this.remote.set(subscription.id, subscription);
    return {
      subscription,
      checkoutUrl: `https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=${subscription.id}`,
    };
  }
  async getSubscription(id: string) {
    return this.remote.get(id) ?? null;
  }
  async cancelSubscription(id: string) {
    const s = this.remote.get(id);
    if (s) this.remote.set(id, { ...s, status: 'cancelled' });
  }
}
const gateway = new FakeGateway();

let app: NestExpressApplication;
let clubId: string;
const users = {} as Record<Name, { id: string; cookie: string }>;

function as(name: Name) {
  const prep = (r: request.Test) =>
    r.set('Cookie', users[name].cookie).set('Host', `${slug}.localhost`);
  const agent = request(app.getHttpServer());
  return {
    get: (p: string) => prep(agent.get(`/api${p}`)),
    post: (p: string) => prep(agent.post(`/api${p}`)),
  };
}

/** El webhook como lo mandaría Mercado Pago, firmado. */
function webhook(dataId: string, secret = WEBHOOK_SECRET) {
  const ts = String(Date.now());
  const requestId = randomUUID();
  const v1 = createHmac('sha256', secret)
    .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return request(app.getHttpServer())
    .post(
      `/api/billing/mercadopago/webhook?data.id=${dataId}&type=subscription_preapproval`,
    )
    .set('x-signature', `ts=${ts},v1=${v1}`)
    .set('x-request-id', requestId)
    .send({ type: 'subscription_preapproval', data: { id: dataId } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAYMENT_GATEWAY)
    .useValue(gateway)
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

  const club = await base.club.create({ data: { slug, name: 'Club Sur' } });
  clubId = club.id;
  // Ana (dueña), Beto (alumno) y alumnos de relleno hasta llenar el plan gratis.
  const filler = [];
  for (let i = 0; i < FREE_MEMBER_LIMIT - 2; i++) {
    const email = `relleno-${i}-${run}@test.local`;
    fillerEmails.push(email);
    filler.push(
      await base.user.create({
        data: { email, passwordHash: 'x', displayName: `R${i}` },
      }),
    );
  }
  await seedMembers(base, [
    { clubId, userId: users.ana.id, role: 'Admin' },
    { clubId, userId: users.beto.id, role: 'Alumno' },
    ...filler.map((u) => ({ clubId, userId: u.id, role: 'Alumno' as const })),
  ]);
});

afterAll(async () => {
  await app.close();
  await base.club.deleteMany({ where: { slug } });
  await base.user.deleteMany({
    where: { email: { in: [...emails, ...fillerEmails] } },
  });
  await base.$disconnect();
});

async function alumnoRoleId(): Promise<string> {
  const roles = await as('ana').get('/club/roles').expect(200);
  return roles.body.find((r: { name: string }) => r.name === 'Alumno').id;
}

describe('planes', () => {
  let subscriptionId: string;

  it('en el plan gratis, con 15 miembros el club está lleno', async () => {
    const plan = await as('beto').get('/club/plan').expect(200);
    expect(plan.body).toEqual({
      plan: 'free',
      maxMembers: FREE_MEMBER_LIMIT,
      members: FREE_MEMBER_LIMIT,
      status: null,
      nextPaymentAt: null,
    });
    const roleId = await alumnoRoleId();
    const res = await as('ana')
      .post('/club/invitations')
      .send({ roleId })
      .expect(402);
    expect(res.body.code).toBe('MEMBER_LIMIT');
  });

  it('solo el dueño paga; el link lleva a Mercado Pago y el plan sigue gratis hasta que pague', async () => {
    await as('beto').post('/club/plan/checkout').expect(403);
    const res = await as('ana').post('/club/plan/checkout').expect(200);
    expect(res.body.checkoutUrl).toContain('mercadopago.cl');
    // Después de pagar, vuelve a la página del plan en el subdominio del club.
    expect(gateway.backUrls.at(-1)).toMatch(
      new RegExp(`^https?://${slug}\\.[^/]+/plan$`),
    );
    subscriptionId = [...gateway.remote.keys()][0];
    expect(gateway.remote.get(subscriptionId)).toMatchObject({
      clubId,
      payerEmail: emails[0],
    });

    const plan = await as('ana').get('/club/plan').expect(200);
    expect(plan.body).toMatchObject({ plan: 'free', status: 'pending' });
  });

  it('un webhook con firma inválida se rechaza y no cambia nada', async () => {
    gateway.remote.set(subscriptionId, {
      ...(gateway.remote.get(subscriptionId) as ProviderSubscription),
      status: 'active',
    });
    await webhook(subscriptionId, 'otra-clave').expect(401);
    const plan = await as('ana').get('/club/plan').expect(200);
    expect(plan.body.plan).toBe('free');
  });

  it('cuando Mercado Pago avisa que se autorizó, el club pasa a Pro y ya puede crecer', async () => {
    await webhook(subscriptionId).expect(200);
    const plan = await as('ana').get('/club/plan').expect(200);
    expect(plan.body).toMatchObject({
      plan: 'pro',
      maxMembers: null,
      status: 'active',
    });
    const roleId = await alumnoRoleId();
    await as('ana').post('/club/invitations').send({ roleId }).expect(201);
  });

  it('un webhook de otra cosa o de una suscripción desconocida no hace nada', async () => {
    await request(app.getHttpServer())
      .post('/api/billing/mercadopago/webhook')
      .send({ type: 'payment', data: { id: '123' } })
      .expect(200);
    await webhook('desconocida').expect(200);
  });

  it('al cancelar, vuelve al plan gratis y, como está lleno, no entra nadie más', async () => {
    await as('beto').post('/club/plan/cancel').expect(403);
    await as('ana').post('/club/plan/cancel').expect(204);
    const plan = await as('ana').get('/club/plan').expect(200);
    expect(plan.body).toMatchObject({ plan: 'free', status: 'cancelled' });
    const roleId = await alumnoRoleId();
    await as('ana').post('/club/invitations').send({ roleId }).expect(402);
  });

  it('otro club no ve esta suscripción', async () => {
    const other = `bill2-${run}`;
    const club = await base.club.create({
      data: { slug: other, name: 'Otro' },
    });
    try {
      await seedMembers(base, [
        { clubId: club.id, userId: users.caro.id, role: 'Admin' },
      ]);
      const plan = await request(app.getHttpServer())
        .get('/api/club/plan')
        .set('Cookie', users.caro.cookie)
        .set('Host', `${other}.localhost`)
        .expect(200);
      expect(plan.body).toMatchObject({
        plan: 'free',
        status: null,
        members: 1,
      });
    } finally {
      await base.club.delete({ where: { id: club.id } });
    }
  });
});
