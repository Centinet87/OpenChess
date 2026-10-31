import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ResolveTenantHandler } from './api/handlers/tenant-query.handlers';
import { ResolveTenantUseCase } from './application/use-cases/resolve-tenant.use-case';
import { ClubSlugCache } from './infrastructure/cache/club-slug.cache';
import { PrismaTenantRepository } from './infrastructure/repositories/prisma-tenant.repository';
@Global()
@Module({
  imports: [CqrsModule],
  providers: [
    ClubSlugCache,
    PrismaTenantRepository,
    ResolveTenantHandler,
    {
      provide: ResolveTenantUseCase,
      inject: [PrismaTenantRepository],
      useFactory: (repository: PrismaTenantRepository) =>
        new ResolveTenantUseCase(repository),
    },
  ],
  exports: [ClubSlugCache],
})
export class TenantModule {}
