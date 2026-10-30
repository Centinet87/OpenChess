import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';

/** Cada cuánto se borran los tokens vencidos. */
const EVERY_MS = 60 * 60 * 1000;

/**
 * Borra los refresh tokens y los links de email vencidos: ya no sirven para
 * nada. Un refresh token revocado pero vigente se guarda hasta que vence,
 * porque si alguien lo reusa delata un robo (ver RefreshSessionUseCase).
 *
 * Con varias instancias corre en todas; da lo mismo, borrar es idempotente.
 */
@Injectable()
export class TokenCleanup implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanup.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: TenantPrisma) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.run().catch((error: unknown) =>
        this.logger.error('No se pudieron borrar los tokens vencidos', error),
      );
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async run(
    now = new Date(),
  ): Promise<{ refreshTokens: number; emailTokens: number }> {
    const where = { expiresAt: { lt: now } };
    const [refreshTokens, emailTokens] = await Promise.all([
      this.prisma.client.refreshToken.deleteMany({ where }),
      this.prisma.client.emailToken.deleteMany({ where }),
    ]);
    return {
      refreshTokens: refreshTokens.count,
      emailTokens: emailTokens.count,
    };
  }
}
