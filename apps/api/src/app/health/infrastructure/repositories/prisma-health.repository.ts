import { Inject, Injectable } from '@nestjs/common';
import type { createPrismaClient } from '@openchess/database';
import { BASE_PRISMA } from '../../../infrastructure/prisma.module';
import { HealthRepository } from '../../application/repositories/health.repository';

@Injectable()
export class PrismaHealthRepository extends HealthRepository {
  constructor(
    @Inject(BASE_PRISMA)
    private readonly db: ReturnType<typeof createPrismaClient>,
  ) {
    super();
  }
  async ping(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }
}
