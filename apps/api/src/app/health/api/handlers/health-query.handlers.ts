import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { CheckHealthQuery } from '../../application/queries/health.queries';
import { CheckHealthUseCase } from '../../application/use-cases/check-health.use-case';

@QueryHandler(CheckHealthQuery)
export class CheckHealthHandler implements IQueryHandler<
  CheckHealthQuery,
  void
> {
  constructor(private readonly useCase: CheckHealthUseCase) {}
  execute(): Promise<void> {
    return this.useCase.execute();
  }
}
