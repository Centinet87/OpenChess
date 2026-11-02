import type {
  EmailAccount,
  EmailTokenPurpose,
} from '../../domain/entities/email-token.entity';

export abstract class EmailTokenRepository {
  abstract user(id: string): Promise<EmailAccount | null>;
  abstract byEmail(email: string): Promise<EmailAccount | null>;
  abstract issue(
    userId: string,
    purpose: EmailTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
    newEmail?: string,
  ): Promise<void>;
  abstract consume(
    tokenHash: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<{ userId: string; newEmail: string | null } | null>;
  abstract verify(userId: string, at: Date): Promise<void>;
  abstract changeEmail(userId: string, email: string, at: Date): Promise<void>;
  abstract resetPassword(
    userId: string,
    passwordHash: string,
    at: Date,
  ): Promise<void>;
}
