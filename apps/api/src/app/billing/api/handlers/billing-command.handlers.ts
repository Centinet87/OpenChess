import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  CancelPlanCommand,
  CheckoutPlanCommand,
  SyncSubscriptionCommand,
} from '../../application/commands/billing.commands';
import { BillingUseCases } from '../../application/use-cases/billing.use-cases';

@CommandHandler(CheckoutPlanCommand)
export class CheckoutPlanHandler implements ICommandHandler<
  CheckoutPlanCommand,
  Awaited<ReturnType<BillingUseCases['checkout']>>
> {
  constructor(private readonly useCase: BillingUseCases) {}
  execute(message: CheckoutPlanCommand) {
    return this.useCase.checkout(
      message.actor,
      message.clubId,
      message.payerEmail,
      message.backUrl,
    );
  }
}

@CommandHandler(CancelPlanCommand)
export class CancelPlanHandler implements ICommandHandler<
  CancelPlanCommand,
  Awaited<ReturnType<BillingUseCases['cancel']>>
> {
  constructor(private readonly useCase: BillingUseCases) {}
  execute(message: CancelPlanCommand) {
    return this.useCase.cancel(message.actor, message.clubId);
  }
}

@CommandHandler(SyncSubscriptionCommand)
export class SyncSubscriptionHandler implements ICommandHandler<
  SyncSubscriptionCommand,
  Awaited<ReturnType<BillingUseCases['sync']>>
> {
  constructor(private readonly useCase: BillingUseCases) {}
  execute(message: SyncSubscriptionCommand) {
    return this.useCase.sync(message.providerSubscriptionId);
  }
}

export const BILLING_COMMAND_HANDLERS = [
  CheckoutPlanHandler,
  CancelPlanHandler,
  SyncSubscriptionHandler,
];
