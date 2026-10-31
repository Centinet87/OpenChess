import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ResolveTenantQuery } from '../../application/queries/tenant.queries';
import { ResolveTenantUseCase } from '../../application/use-cases/resolve-tenant.use-case';

@QueryHandler(ResolveTenantQuery)
export class ResolveTenantHandler implements IQueryHandler<
  ResolveTenantQuery,
  string | null
> {
  constructor(private readonly useCase: ResolveTenantUseCase) {}
  execute(query: ResolveTenantQuery): Promise<string | null> {
    return this.useCase.execute(query.slug);
  }
}
