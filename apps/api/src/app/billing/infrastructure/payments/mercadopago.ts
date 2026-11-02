import {
  type PaymentGateway,
  type ProviderSubscription,
} from '../../application/repositories/billing.ports';
import { type SubscriptionStatus } from '../../domain/entities/subscription';
import { BillingError } from '../../domain/errors';

const API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10_000;

/** Lo que usamos de https://www.mercadopago.cl/developers/es/reference/subscriptions */
export interface MercadoPagoPreapproval {
  id: string;
  status: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  init_point?: string;
}

const STATUS: Record<string, SubscriptionStatus> = {
  pending: 'pending',
  authorized: 'active',
  paused: 'paused',
  cancelled: 'cancelled',
};

export function parsePreapproval(
  p: MercadoPagoPreapproval,
): ProviderSubscription | null {
  // Sin external_reference no es una suscripción creada por OpenChess.
  if (!p.external_reference) return null;
  return {
    id: p.id,
    status: STATUS[p.status] ?? 'pending',
    clubId: p.external_reference,
    payerEmail: p.payer_email ?? '',
    nextPaymentAt: p.next_payment_date ? new Date(p.next_payment_date) : null,
  };
}

/**
 * Firma de los webhooks (header x-signature: "ts=...,v1=..."). Mercado Pago firma
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256 y la clave
 * secreta del webhook.
 */

export interface MercadoPagoConfig {
  readonly accessToken: string | undefined;
  /** Precio mensual del plan pagado. */
  readonly price: number;
  readonly currency: string;
}

/** Suscripciones (preapproval) de Mercado Pago. */
export class MercadoPagoGateway implements PaymentGateway {
  readonly provider = 'mercadopago';

  constructor(private readonly config: MercadoPagoConfig) {}

  async createSubscription(input: {
    clubId: string;
    clubName: string;
    payerEmail: string;
    backUrl: string;
  }): Promise<{ subscription: ProviderSubscription; checkoutUrl: string }> {
    const created = await this.call<MercadoPagoPreapproval>('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `OpenChess Pro — ${input.clubName}`,
        external_reference: input.clubId,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: this.config.price,
          currency_id: this.config.currency,
        },
      }),
    });
    const subscription = created && parsePreapproval(created);
    if (!subscription || !created?.init_point) throw unavailable();
    return { subscription, checkoutUrl: created.init_point };
  }

  async getSubscription(id: string): Promise<ProviderSubscription | null> {
    const found = await this.call<MercadoPagoPreapproval>(
      `/preapproval/${encodeURIComponent(id)}`,
    );
    return found ? parsePreapproval(found) : null;
  }

  async cancelSubscription(id: string): Promise<void> {
    await this.call(`/preapproval/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }

  /** null si responde 404. */
  private async call<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    if (!this.config.accessToken) throw unavailable();
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw unavailable();
    }
    if (res.status === 404) return null;
    if (!res.ok) throw unavailable();
    return (await res.json()) as T;
  }
}

function unavailable(): BillingError {
  return new BillingError(
    'BILLING_UNAVAILABLE',
    'Los pagos no están disponibles ahora. Intenta de nuevo más tarde',
  );
}
