import { FREE_MEMBER_LIMIT } from '../../domain/entities/plan';
import type { SubscriptionSnapshot } from '../../domain/entities/subscription';
import { BillingError } from '../../domain/errors';
import type {
  PaymentGateway,
  ProviderSubscription,
  SubscriptionsRepository,
} from '../repositories/billing.ports';
import { BillingUseCases } from './billing.use-cases';

class MemorySubscriptions implements SubscriptionsRepository {
  rows = new Map<string, SubscriptionSnapshot>();
  members = 3;
  async find(clubId: string) {
    return this.rows.get(clubId) ?? null;
  }
  async save(s: SubscriptionSnapshot) {
    this.rows.set(s.clubId, s);
  }
  async countMembers() {
    return this.members;
  }
  async clubName() {
    return 'Club';
  }
}

/** Doble de Mercado Pago: guarda las suscripciones y deja cambiar su estado. */
class FakeGateway implements PaymentGateway {
  readonly provider = 'fake';
  remote = new Map<string, ProviderSubscription>();
  cancelled: string[] = [];
  async createSubscription(input: { clubId: string; payerEmail: string }) {
    const subscription: ProviderSubscription = {
      id: `sub-${this.remote.size + 1}`,
      status: 'pending',
      clubId: input.clubId,
      payerEmail: input.payerEmail,
      nextPaymentAt: null,
    };
    this.remote.set(subscription.id, subscription);
    return {
      subscription,
      checkoutUrl: `https://pago.test/${subscription.id}`,
    };
  }
  async getSubscription(id: string) {
    return this.remote.get(id) ?? null;
  }
  async cancelSubscription(id: string) {
    this.cancelled.push(id);
  }
  /** Lo que haría la persona al pagar en Mercado Pago. */
  authorize(id: string) {
    const s = this.remote.get(id) as ProviderSubscription;
    this.remote.set(id, { ...s, status: 'active' });
  }
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return e instanceof BillingError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('BillingUseCases', () => {
  let repo: MemorySubscriptions;
  let gateway: FakeGateway;
  let billing: BillingUseCases;
  const owner = { isOwner: true };
  const club = 'club';

  beforeEach(() => {
    repo = new MemorySubscriptions();
    gateway = new FakeGateway();
    billing = new BillingUseCases({ subscriptions: repo, gateway });
  });

  it('sin suscripción el club está en el plan gratis, con tope de miembros', async () => {
    expect(await billing.plan('club')).toMatchObject({
      plan: 'free',
      maxMembers: FREE_MEMBER_LIMIT,
      members: 3,
      subscription: null,
    });
  });

  it('el club pasa al plan pagado recién cuando el proveedor confirma el pago', async () => {
    const { checkoutUrl } = await billing.checkout(
      owner,
      club,
      'ana@test.local',
      'https://x/back',
    );
    expect(checkoutUrl).toBe('https://pago.test/sub-1');
    expect((await billing.plan('club')).plan).toBe('free');

    gateway.authorize('sub-1');
    expect(await billing.sync('sub-1')).toBe('club');
    expect(await billing.plan('club')).toMatchObject({
      plan: 'pro',
      maxMembers: null,
    });
    expect(
      await code(billing.checkout(owner, club, 'a@x.cl', 'https://x')),
    ).toBe('ALREADY_SUBSCRIBED');
  });

  it('solo el dueño cambia el plan', async () => {
    expect(
      await code(
        billing.checkout({ isOwner: false }, club, 'a@x.cl', 'https://x'),
      ),
    ).toBe('FORBIDDEN');
    expect(await code(billing.cancel({ isOwner: false }, 'club'))).toBe(
      'FORBIDDEN',
    );
  });

  it('cancelar avisa al proveedor y deja al club en el plan gratis', async () => {
    expect(await code(billing.cancel(owner, 'club'))).toBe('NOT_SUBSCRIBED');
    await billing.checkout(owner, club, 'a@x.cl', 'https://x');
    gateway.authorize('sub-1');
    await billing.sync('sub-1');

    await billing.cancel(owner, 'club');
    expect(gateway.cancelled).toEqual(['sub-1']);
    expect((await billing.plan('club')).plan).toBe('free');
  });

  it('un aviso de una suscripción que no existe no cambia nada', async () => {
    expect(await billing.sync('inventada')).toBeNull();
    expect(repo.rows.size).toBe(0);
  });
});
