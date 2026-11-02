import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { SkipThrottle } from '@nestjs/throttler';
import { CheckHealthQuery } from '../../application/queries/health.queries';

@Controller()
export class AppController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  info(): { name: string } {
    return { name: 'OpenChess API' };
  }

  /** Para el chequeo de salud del hosting: la API responde y llega a la BD. */
  @Get('health')
  @SkipThrottle()
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.queries.execute<CheckHealthQuery, void>(
        new CheckHealthQuery(),
      );
    } catch {
      throw new ServiceUnavailableException('Sin conexión a la base de datos');
    }
    return { status: 'ok' };
  }
}
