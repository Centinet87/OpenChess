import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BillingUseCases } from '@openchess/billing';
import type { CheckoutView, PlanView } from '@openchess/contracts';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import { ClubMemberGuard } from '../clubs/club-member.guard';
import { ZodPipe } from '../common/zod.pipe';
import { clubOrigin } from '../tenant/club-slug';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthGuard } from '../identity/auth.guard';
import { AuthService } from '../identity/auth.service';
import { isValidWebhookSignature } from './mercadopago';

/** Plan del club: lo ve cualquier miembro; lo cambia solo el dueño. */
@Controller('club/plan')
@UseGuards(AuthGuard, ClubMemberGuard)
export class PlanController {
  constructor(
    private readonly billing: BillingUseCases,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async plan(): Promise<PlanView> {
    const p = await this.billing.plan(this.cls.get('clubId'));
    return {
      plan: p.plan,
      maxMembers: p.maxMembers,
      members: p.members,
      status: p.subscription?.status ?? null,
      nextPaymentAt: p.subscription?.nextPaymentAt?.toISOString() ?? null,
    };
  }

  /** Devuelve el link de pago de Mercado Pago. Al pagar, vuelve a /plan del club. */
  @Post('checkout')
  @HttpCode(200)
  async checkout(): Promise<CheckoutView> {
    const userId = this.cls.get('userId');
    const { email } = await this.auth.profile(userId);
    return this.billing.checkout(
      { isOwner: this.cls.get('role').isOwner },
      this.cls.get('clubId'),
      email,
      `${clubOrigin(this.env.PUBLIC_URL, this.cls.get('clubSlug'))}/plan`,
    );
  }

  @Post('cancel')
  @HttpCode(204)
  async cancel(): Promise<void> {
    await this.billing.cancel(
      { isOwner: this.cls.get('role').isOwner },
      this.cls.get('clubId'),
    );
  }
}

const webhookSchema = z.object({
  type: z.string().max(100).optional(),
  data: z.object({ id: z.string().max(100) }).optional(),
});

/**
 * Webhook de Mercado Pago (se configura en su panel, en Webhooks, con el evento
 * de suscripciones). Responde 200 enseguida; el estado real se consulta a la API.
 */
@Controller('billing/mercadopago')
@SkipThrottle()
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly billing: BillingUseCases,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body(new ZodPipe(webhookSchema)) body: z.infer<typeof webhookSchema>,
    @Query('data.id') queryId: string | undefined,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const id = queryId ?? body.data?.id;
    if (!id || body.type !== 'subscription_preapproval') return { ok: true };

    const secret = this.env.MP_WEBHOOK_SECRET;
    if (
      secret &&
      !isValidWebhookSignature({
        secret,
        signature: req.header('x-signature'),
        requestId: req.header('x-request-id'),
        dataId: id,
      })
    ) {
      throw new UnauthorizedException('Firma inválida');
    }

    const clubId = await this.billing.sync(id);
    this.logger.log(`Suscripción ${id} sincronizada (club ${clubId ?? '?'})`);
    return { ok: true };
  }
}
