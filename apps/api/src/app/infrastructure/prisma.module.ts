import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  createPrismaClient,
  tenantTransaction,
  withTenantContext,
  type TenantPrismaClient,
} from '@openchess/database';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const BASE_PRISMA = Symbol('BASE_PRISMA');

/**
 * Cliente con RLS: lo que se inyecta en repositorios y servicios.
 * El club y el usuario salen del contexto de la request (nestjs-cls).
 */
@Injectable()
export class TenantPrisma implements OnModuleDestroy {
  readonly client: TenantPrismaClient;

  constructor(
    @Inject(BASE_PRISMA)
    private readonly base: ReturnType<typeof createPrismaClient>,
    private readonly cls: ClsService,
  ) {
    this.client = withTenantContext(base, () => this.context());
  }

  /** Varias escrituras atómicas con RLS (ver tenantTransaction). */
  transaction(
    build: Parameters<typeof tenantTransaction>[2],
  ): Promise<unknown[]> {
    return tenantTransaction(this.base, this.context(), build);
  }

  private context() {
    return {
      clubId: this.cls.get('clubId'),
      userId: this.cls.get('userId'),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: BASE_PRISMA,
      inject: [ENV],
      useFactory: (env: Env) => createPrismaClient(env.DATABASE_URL),
    },
    TenantPrisma,
  ],
  exports: [TenantPrisma, BASE_PRISMA],
})
export class PrismaModule {}
