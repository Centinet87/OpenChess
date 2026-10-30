import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { createPrismaClient } from '@openchess/database';
import { BASE_PRISMA } from './infrastructure/prisma.module';

@Controller()
export class AppController {
  constructor(
    @Inject(BASE_PRISMA)
    private readonly db: ReturnType<typeof createPrismaClient>,
  ) {}

  @Get()
  info(): { name: string } {
    return { name: 'OpenChess API' };
  }

  /** Para el chequeo de salud del hosting: la API responde y llega a la BD. */
  @Get('health')
  @SkipThrottle()
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Sin conexión a la base de datos');
    }
    return { status: 'ok' };
  }
}
