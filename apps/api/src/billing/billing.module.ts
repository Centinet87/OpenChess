import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BillingUseCases, type PaymentGateway } from '@openchess/billing';
import { ENV } from '../app/config/config.module';
import type { Env } from '../app/config/env';
import { AuthModule } from '../app/auth/auth.module';
import { BillingErrorFilter } from './billing-error.filter';
import {
  MercadoPagoWebhookController,
  PlanController,
} from './billing.controller';
import { MercadoPagoGateway } from './mercadopago';
import { PrismaSubscriptionsRepository } from './prisma-subscriptions.repository';

/** El proveedor de pagos; los tests lo cambian por un doble. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Planes del club y suscripción con Mercado Pago. */
@Module({
  imports: [AuthModule],
  controllers: [PlanController, MercadoPagoWebhookController],
  providers: [
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
  exports: [BillingUseCases],
})
export class BillingModule {}
