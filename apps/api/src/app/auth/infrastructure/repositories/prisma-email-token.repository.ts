import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import { EmailTokenRepository } from '../../application/repositories/email-token.repository';
import { AccountError } from '../../domain/account.error';
import type { EmailTokenPurpose } from '../../domain/entities/email-token.entity';

const EMAIL_ACCOUNT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  emailVerifiedAt: true,
} as const;

@Injectable()
export class PrismaEmailTokenRepository extends EmailTokenRepository {
  constructor(private readonly prisma: TenantPrisma) {
    super();
  }
  user(id: string) {
    return this.prisma.client.user.findUnique({
      where: { id },
      select: EMAIL_ACCOUNT,
    });
  }
  byEmail(email: string) {
    return this.prisma.client.user.findUnique({
      where: { email },
      select: EMAIL_ACCOUNT,
    });
  }

  async issue(
    userId: string,
    purpose: EmailTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
    newEmail?: string,
  ): Promise<void> {
    await this.prisma.transaction((db) => [
      db.emailToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      db.emailToken.create({
        data: { userId, purpose, tokenHash, expiresAt, newEmail },
      }),
    ]);
  }

  async consume(tokenHash: string, purpose: EmailTokenPurpose, now: Date) {
    const stored = await this.prisma.client.emailToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, purpose: true, newEmail: true },
    });
    if (!stored || stored.purpose !== purpose) return null;
    const { count } = await this.prisma.client.emailToken.updateMany({
      where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count ? { userId: stored.userId, newEmail: stored.newEmail } : null;
  }

  async verify(userId: string, at: Date): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: at },
    });
  }

  async changeEmail(userId: string, email: string, at: Date): Promise<void> {
    try {
      await this.prisma.client.user.update({
        where: { id: userId },
        data: { email, emailVerifiedAt: at },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new AccountError(
          'EMAIL_TAKEN',
          'Ese email ya está en uso en otra cuenta',
        );
      throw error;
    }
  }

  async resetPassword(
    userId: string,
    passwordHash: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.transaction((db) => [
      db.user.update({
        where: { id: userId },
        data: { passwordHash, emailVerifiedAt: at },
      }),
      db.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: at },
      }),
    ]);
  }
}
