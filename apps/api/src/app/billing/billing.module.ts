import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MercadoPagoWebhookController } from './api/controllers/mercadopago-webhook.controller';
import { PlanController } from './api/controllers/plan.controller';
import { BillingErrorFilter } from './api/filters/billing-error.filter';
import { BILLING_COMMAND_HANDLERS } from './api/handlers/billing-command.handlers';
import { BILLING_QUERY_HANDLERS } from './api/handlers/billing-query.handlers';
import { type PaymentGateway } from './application/repositories/billing.ports';
import { BillingUseCases } from './application/use-cases/billing.use-cases';
import { MercadoPagoGateway } from './infrastructure/payments/mercadopago';
import { PrismaSubscriptionsRepository } from './infrastructure/repositories/prisma-subscriptions.repository';

/** El proveedor de pagos; los tests lo cambian por un doble. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Planes del club y suscripción con Mercado Pago. */
@Module({
  imports: [AuthModule],
  controllers: [PlanController, MercadoPagoWebhookController],
  providers: [
    ...BILLING_QUERY_HANDLERS,
    ...BILLING_COMMAND_HANDLERS,
    PrismaSubscriptionsRepository,
    { provide: APP_FILTER, useClass: BillingErrorFilter },
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV],
      useFactory: (env: Env): PaymentGateway =>
        new MercadoPagoGateway({
          accessToken: env.MP_ACCESS_TOKEN,
          price: env.PLAN_PRO_PRICE,
          currency: env.PLAN_CURRENCY,
        }),
    },
    {
      provide: BillingUseCases,
      inject: [PrismaSubscriptionsRepository, PAYMENT_GATEWAY],
      useFactory: (
        subscriptions: PrismaSubscriptionsRepository,
        gateway: PaymentGateway,
      ) => new BillingUseCases({ subscriptions, gateway }),
    },
  ],
})
export class BillingModule {}
