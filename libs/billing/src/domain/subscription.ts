import { PLANS, type Plan } from './plan.js';

/**
 * Estado de la suscripción según el proveedor. Solo `active` da el plan pagado:
 * pendiente (aún no paga), pausada o cancelada dejan al club en el gratis.
 */
export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled';

export interface SubscriptionSnapshot {
  readonly clubId: string;
  readonly provider: string;
  readonly providerSubscriptionId: string;
  readonly status: SubscriptionStatus;
  readonly payerEmail: string;
  readonly nextPaymentAt: Date | null;
}

export function planOf(subscription: SubscriptionSnapshot | null): Plan {
  return subscription?.status === 'active' ? PLANS.pro : PLANS.free;
}
