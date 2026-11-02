import { AccountError } from '../../domain/account.error';
import type { EmailTokenPurpose } from '../../domain/entities/email-token.entity';
import {
  confirmEmailChange,
  emailChanged,
  passwordChanged,
  resetPassword,
  verifyEmail,
} from '../email/emails';
import type { Mailer } from '../email/mailer.port';
import type { AccountEmailOperations } from '../repositories/account.operations';
import type { EmailTokenRepository } from '../repositories/email-token.repository';
import type { AuthCrypto } from '../security/auth.crypto';

const TTL_MS: Record<EmailTokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
  CHANGE_EMAIL: 24 * 60 * 60 * 1000,
};

const INVALID_LINK = 'El link no es válido o ya venció. Pide uno nuevo';

/**
 * Verificar el email y recuperar la contraseña con links de un solo uso. Del
 * token solo se guarda el SHA-256, como con los refresh tokens.
 */

export class AccountEmailsUseCases implements AccountEmailOperations {
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly repository: EmailTokenRepository,
    private readonly crypto: AuthCrypto,
    private readonly mailer: Mailer,
    private readonly publicUrl: string,
    private readonly logger: { error(message: string, error: unknown): void },
  ) {}

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
    const user = await this.repository.user(userId);
    if (!user || user.emailVerifiedAt) return;
    const token = await this.issue(userId, 'VERIFY_EMAIL');
    await this.deliver(
      verifyEmail(user.email, user.displayName, this.link('verificar', token)),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const { userId } = await this.consume(token, 'VERIFY_EMAIL');
    await this.repository.verify(userId, new Date());
  }

  /**
   * Corre en segundo plano y responde al instante, exista o no la cuenta: ni la
   * respuesta ni lo que tarda revelan qué emails están registrados.
   */
  requestPasswordReset(email: string): void {
    this.track(this.sendPasswordReset(email), 'el cambio de contraseña');
  }

  /**
   * Pide usar otro email: manda un link al nuevo, y el cambio recién se hace al
   * usarlo. Responde igual esté o no ocupado el email nuevo, para que no sirva
   * para averiguar qué emails tienen cuenta; eso se revisa al confirmar.
   */
  async requestEmailChange(
    userId: string,
    password: string,
    newEmail: string,
  ): Promise<void> {
    const user = await this.repository.user(userId);
    if (
      !user ||
      !(await this.crypto.verifyPassword(user.passwordHash, password))
    ) {
      throw new AccountError('incorrect_password', 'Contraseña incorrecta');
    }
    if (newEmail === user.email) {
      throw new AccountError('same_email', 'Ese ya es el email de tu cuenta');
    }
    this.track(
      this.sendEmailChange(userId, user.displayName, newEmail),
      'la confirmación del email nuevo',
    );
  }

  private async sendEmailChange(
    userId: string,
    name: string,
    newEmail: string,
  ): Promise<void> {
    // Si ya tiene cuenta, a su dueño no le llega un link que no pidió.
    const taken = await this.repository.byEmail(newEmail);
    if (taken) return;
    const token = await this.issue(userId, 'CHANGE_EMAIL', newEmail);
    await this.deliver(
      confirmEmailChange(newEmail, name, this.link('cambiar-email', token)),
    );
  }

  /** El link llegó al email nuevo: la cuenta pasa a usarlo, ya verificado. */
  async confirmEmailChange(token: string): Promise<void> {
    const { userId, newEmail } = await this.consume(token, 'CHANGE_EMAIL');
    const before = await this.repository.user(userId);
    if (!before || !newEmail)
      throw new AccountError('invalid_link', INVALID_LINK);
    await this.repository.changeEmail(userId, newEmail, new Date());
    // Al email de antes: si no fue la persona, se entera.
    this.track(
      this.deliver(
        emailChanged(
          before.email,
          before.displayName,
          newEmail,
          this.publicUrl,
        ),
      ),
      'el aviso de cambio de email',
    );
  }

  /** Avisa que la contraseña cambió: si no fue la persona, se entera. */
  queuePasswordChanged(userId: string): void {
    this.track(this.sendPasswordChanged(userId), 'el aviso de contraseña');
  }

  private async sendPasswordChanged(userId: string): Promise<void> {
    const user = await this.repository.user(userId);
    if (!user) return;
    await this.deliver(
      passwordChanged(user.email, user.displayName, this.publicUrl),
    );
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
    const user = await this.repository.byEmail(email);
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
    const { userId } = await this.consume(token, 'RESET_PASSWORD');
    await this.repository.resetPassword(
      userId,
      await this.crypto.hashPassword(password),
      new Date(),
    );
  }

  /** Un link nuevo deja sin efecto los anteriores del mismo tipo. */
  private async issue(
    userId: string,
    purpose: EmailTokenPurpose,
    newEmail?: string,
  ): Promise<string> {
    const now = new Date();
    const token = this.crypto.generateToken();
    await this.repository.issue(
      userId,
      purpose,
      this.crypto.hashToken(token),
      new Date(now.getTime() + TTL_MS[purpose]),
      now,
      newEmail,
    );
    return token;
  }

  /** Marca el token como usado; condicionado a que no lo esté, así sirve una sola vez. */
  private async consume(
    token: string,
    purpose: EmailTokenPurpose,
  ): Promise<{ userId: string; newEmail: string | null }> {
    const stored = await this.repository.consume(
      this.crypto.hashToken(token),
      purpose,
      new Date(),
    );
    if (!stored) throw new AccountError('invalid_link', INVALID_LINK);
    return stored;
  }

  private link(page: string, token: string): string {
    return `${this.publicUrl}/${page}?token=${encodeURIComponent(token)}`;
  }

  private async deliver(email: Parameters<Mailer['send']>[0]): Promise<void> {
    try {
      await this.mailer.send(email);
    } catch (error) {
      this.logger.error(`No se pudo enviar "${email.subject}"`, error);
    }
  }
}
