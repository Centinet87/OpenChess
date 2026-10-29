import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { TenantPrisma } from '../infrastructure/prisma.module';
import { generateOpaqueToken, hashPassword, sha256 } from './crypto';
import { resetPassword, verifyEmail } from './emails';
import { MAILER, type Mailer } from './mailer';

type Purpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

const TTL_MS: Record<Purpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

const INVALID_LINK = 'El link no es válido o ya venció. Pide uno nuevo';

/**
 * Verificar el email y recuperar la contraseña con links de un solo uso. Del
 * token solo se guarda el SHA-256, como con los refresh tokens.
 */
@Injectable()
export class AccountEmailsService implements OnModuleDestroy {
  private readonly logger = new Logger(AccountEmailsService.name);
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: TenantPrisma,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.idle();
  }

  /**
   * Manda el link para confirmar el email, en segundo plano: el registro no
   * espera al proveedor ni falla si el email no sale (se puede pedir otro).
   */
  queueVerification(userId: string): void {
    this.track(this.sendVerification(userId), 'el email de verificación');
  }

  private async sendVerification(userId: string): Promise<void> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;
    const token = await this.issue(userId, 'VERIFY_EMAIL');
    await this.deliver(
      verifyEmail(user.email, user.displayName, this.link('verificar', token)),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consume(token, 'VERIFY_EMAIL');
    await this.db.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /**
   * Corre en segundo plano y responde al instante, exista o no la cuenta: ni la
   * respuesta ni lo que tarda revelan qué emails están registrados.
   */
  requestPasswordReset(email: string): void {
    this.track(this.sendPasswordReset(email), 'el cambio de contraseña');
  }

  private track(work: Promise<void>, what: string): void {
    const tracked = work
      .catch((error: unknown) =>
        this.logger.error(`No se pudo preparar ${what}`, error),
      )
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  /** Espera los envíos en segundo plano (tests y apagado ordenado). */
  async idle(): Promise<void> {
    await Promise.all(this.pending);
  }

  private async sendPasswordReset(email: string): Promise<void> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) return;
    const token = await this.issue(user.id, 'RESET_PASSWORD');
    await this.deliver(
      resetPassword(
        user.email,
        user.displayName,
        this.link('restablecer', token),
      ),
    );
  }

  /** Cambia la contraseña y cierra todas las sesiones abiertas. */
  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.consume(token, 'RESET_PASSWORD');
    await this.db.user.update({
      where: { id: userId },
      // Quien recibe el link en su email también prueba que el email es suyo.
      data: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Un link nuevo deja sin efecto los anteriores del mismo tipo. */
  private async issue(userId: string, purpose: Purpose): Promise<string> {
    const now = new Date();
    await this.db.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
    const token = generateOpaqueToken();
    await this.db.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + TTL_MS[purpose]),
      },
    });
    return token;
  }

  /** Marca el token como usado; condicionado a que no lo esté, así sirve una sola vez. */
  private async consume(token: string, purpose: Purpose): Promise<string> {
    const now = new Date();
    const stored = await this.db.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, userId: true, purpose: true },
    });
    if (!stored || stored.purpose !== purpose) {
      throw new BadRequestException(INVALID_LINK);
    }
    const { count } = await this.db.emailToken.updateMany({
      where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw new BadRequestException(INVALID_LINK);
    return stored.userId;
  }

  private link(page: string, token: string): string {
    return `${this.env.PUBLIC_URL}/${page}?token=${encodeURIComponent(token)}`;
  }

  private async deliver(email: Parameters<Mailer['send']>[0]): Promise<void> {
    try {
      await this.mailer.send(email);
    } catch (error) {
      this.logger.error(`No se pudo enviar "${email.subject}"`, error);
    }
  }
}
