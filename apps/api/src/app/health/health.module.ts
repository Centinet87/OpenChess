import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AppController } from './api/controllers/app.controller';
import { CheckHealthHandler } from './api/handlers/health-query.handlers';
import { CheckHealthUseCase } from './application/use-cases/check-health.use-case';
import { PrismaHealthRepository } from './infrastructure/repositories/prisma-health.repository';

@Module({
  imports: [CqrsModule],
  controllers: [AppController],
  providers: [
    PrismaHealthRepository,
    CheckHealthHandler,
    {
      provide: CheckHealthUseCase,
      inject: [PrismaHealthRepository],
      useFactory: (repository: PrismaHealthRepository) =>
        new CheckHealthUseCase(repository),
    },
  ],
})
export class HealthModule {}
