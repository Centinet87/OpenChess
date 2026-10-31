import type { PlanId } from '../../domain/entities/plan';
import {
  planOf,
  type SubscriptionSnapshot,
} from '../../domain/entities/subscription';
import { BillingError } from '../../domain/errors';
import type {
  BillingDeps,
  ProviderSubscription,
} from '../repositories/billing.ports';

export interface ClubPlan {
  readonly plan: PlanId;
  readonly maxMembers: number | null;
  readonly members: number;
  readonly subscription: SubscriptionSnapshot | null;
}

/** Quien actúa sobre la facturación: solo el dueño del club puede. */
export interface BillingActor {
  readonly isOwner: boolean;
}

export class BillingUseCases {
  constructor(private readonly deps: BillingDeps) {}

  async plan(clubId: string): Promise<ClubPlan> {
    const [subscription, members] = await Promise.all([
      this.deps.subscriptions.find(clubId),
      this.deps.subscriptions.countMembers(clubId),
    ]);
    const plan = planOf(subscription);
    return {
      plan: plan.id,
      maxMembers: plan.maxMembers,
      members,
      subscription,
    };
  }

  /** Tope de miembros del club según su plan (null: sin tope). */
  async maxMembers(clubId: string): Promise<number | null> {
    return planOf(await this.deps.subscriptions.find(clubId)).maxMembers;
  }

  /**
   * Crea la suscripción en el proveedor y devuelve el link de pago. El club
   * pasa al plan pagado recién cuando el proveedor avisa que se autorizó.
   */
  async checkout(
    actor: BillingActor,
    clubId: string,
    payerEmail: string,
    backUrl: string,
  ): Promise<{ checkoutUrl: string }> {
    assertOwner(actor);
    const current = await this.deps.subscriptions.find(clubId);
    if (current?.status === 'active') {
      throw new BillingError(
        'ALREADY_SUBSCRIBED',
        'El club ya tiene el plan pagado',
      );
    }
    const { subscription, checkoutUrl } =
      await this.deps.gateway.createSubscription({
        clubId,
        clubName: await this.deps.subscriptions.clubName(clubId),
        payerEmail,
        backUrl,
      });
    await this.save(subscription);
    return { checkoutUrl };
  }

  async cancel(actor: BillingActor, clubId: string): Promise<void> {
    assertOwner(actor);
    const current = await this.deps.subscriptions.find(clubId);
    if (!current || current.status === 'cancelled') {
      throw new BillingError(
        'NOT_SUBSCRIBED',
        'El club no tiene una suscripción',
      );
    }
    await this.deps.gateway.cancelSubscription(current.providerSubscriptionId);
    await this.deps.subscriptions.save({ ...current, status: 'cancelled' });
  }

  /**
   * El proveedor avisó que algo cambió. Se consulta el estado real en vez de
   * creerle al aviso: uno falsificado no puede activar un plan.
   * Devuelve el club afectado, o null si la suscripción no existe.
   */
  async sync(providerSubscriptionId: string): Promise<string | null> {
    const subscription = await this.deps.gateway.getSubscription(
      providerSubscriptionId,
    );
    if (!subscription) return null;
    await this.save(subscription);
    return subscription.clubId;
  }

  private save(s: ProviderSubscription): Promise<void> {
    return this.deps.subscriptions.save({
      clubId: s.clubId,
      provider: this.deps.gateway.provider,
      providerSubscriptionId: s.id,
      status: s.status,
      payerEmail: s.payerEmail,
      nextPaymentAt: s.nextPaymentAt,
    });
  }
}

function assertOwner(actor: BillingActor): void {
  if (!actor.isOwner) {
    throw new BillingError(
      'FORBIDDEN',
      'Solo el dueño del club puede cambiar el plan',
    );
  }
}
