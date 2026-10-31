import type { BillingActor } from '../use-cases/billing.use-cases';

export class CheckoutPlanCommand {
  constructor(
    readonly actor: BillingActor,
    readonly clubId: string,
    readonly payerEmail: string,
    readonly backUrl: string,
  ) {}
}

export class CancelPlanCommand {
  constructor(
    readonly actor: BillingActor,
    readonly clubId: string,
  ) {}
}

export class SyncSubscriptionCommand {
  constructor(readonly providerSubscriptionId: string) {}
}
