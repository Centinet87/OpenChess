import type { HealthRepository } from '../repositories/health.repository';

export class CheckHealthUseCase {
  constructor(private readonly repository: HealthRepository) {}
  execute(): Promise<void> {
    return this.repository.ping();
  }
}
