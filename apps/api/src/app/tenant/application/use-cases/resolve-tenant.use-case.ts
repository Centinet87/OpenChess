import type { TenantRepository } from '../repositories/tenant.repository';

export class ResolveTenantUseCase {
  constructor(private readonly repository: TenantRepository) {}
  execute(slug: string): Promise<string | null> {
    return this.repository.clubId(slug);
  }
}
