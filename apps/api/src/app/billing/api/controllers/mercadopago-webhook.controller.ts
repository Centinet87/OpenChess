import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../../../common/zod.pipe';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { SyncSubscriptionCommand } from '../../application/commands/billing.commands';
import { isValidWebhookSignature } from '../../application/security/webhook-signature';

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
    private readonly commands: CommandBus,
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

    const clubId = await this.commands.execute<
      SyncSubscriptionCommand,
      string | null
    >(new SyncSubscriptionCommand(id));
    this.logger.log(`Suscripción ${id} sincronizada (club ${clubId ?? '?'})`);
    return { ok: true };
  }
}
