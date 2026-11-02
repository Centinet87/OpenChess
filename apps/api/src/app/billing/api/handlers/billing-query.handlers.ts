import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetClubPlanQuery,
  GetMemberLimitQuery,
} from '../../application/queries/billing.queries';
import { BillingUseCases } from '../../application/use-cases/billing.use-cases';

@QueryHandler(GetClubPlanQuery)
export class GetClubPlanHandler implements IQueryHandler<
  GetClubPlanQuery,
  Awaited<ReturnType<BillingUseCases['plan']>>
> {
  constructor(private readonly useCase: BillingUseCases) {}
  execute(message: GetClubPlanQuery) {
    return this.useCase.plan(message.clubId);
  }
}

@QueryHandler(GetMemberLimitQuery)
export class GetMemberLimitHandler implements IQueryHandler<
  GetMemberLimitQuery,
  Awaited<ReturnType<BillingUseCases['maxMembers']>>
> {
  constructor(private readonly useCase: BillingUseCases) {}
  execute(message: GetMemberLimitQuery) {
    return this.useCase.maxMembers(message.clubId);
  }
}

export const BILLING_QUERY_HANDLERS = [
  GetClubPlanHandler,
  GetMemberLimitHandler,
];
