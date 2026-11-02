import type {
  SubscriptionSnapshot,
  SubscriptionStatus,
} from '../../domain/entities/subscription';

/** La suscripción tal como la ve el proveedor de pagos. */
export interface ProviderSubscription {
  readonly id: string;
  readonly status: SubscriptionStatus;
  /** El club, que mandamos al crearla (external_reference en Mercado Pago). */
  readonly clubId: string;
  readonly payerEmail: string;
  readonly nextPaymentAt: Date | null;
}

/**
 * Proveedor de pagos (hoy Mercado Pago). Lanza BillingError BILLING_UNAVAILABLE
 * si no está configurado o no responde.
 */
export interface PaymentGateway {
  readonly provider: string;
  /** Crea la suscripción mensual y devuelve el link donde la persona paga. */
  createSubscription(input: {
    clubId: string;
    clubName: string;
    payerEmail: string;
    backUrl: string;
  }): Promise<{ subscription: ProviderSubscription; checkoutUrl: string }>;
  /** El estado real: nunca se confía en lo que trae un webhook. */
  getSubscription(id: string): Promise<ProviderSubscription | null>;
  cancelSubscription(id: string): Promise<void>;
}

/** Lo implementa la infraestructura. Solo ve la suscripción del club del contexto. */
export interface SubscriptionsRepository {
  find(clubId: string): Promise<SubscriptionSnapshot | null>;
  save(subscription: SubscriptionSnapshot): Promise<void>;
  countMembers(clubId: string): Promise<number>;
  clubName(clubId: string): Promise<string>;
}

export interface BillingDeps {
  readonly subscriptions: SubscriptionsRepository;
  readonly gateway: PaymentGateway;
}
