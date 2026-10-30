import { Injectable } from '@nestjs/common';
import { Prisma } from '@openchess/database';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import type {
  AuthRepository,
  CreateRefreshTokenInput,
  CreateUserInput,
  RefreshTokenInput,
} from '../../application/ports/auth.repository';
import { AuthError } from '../../domain/auth.error';
import type {
  RefreshToken,
  UserCredentials,
  UserProfile,
} from '../../domain/auth.types';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: TenantPrisma) {}

  findUserByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
  }

  findUserById(userId: string): Promise<UserProfile | null> {
    return this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
  }

  async createUser(input: CreateUserInput): Promise<{ id: string }> {
    try {
      return await this.prisma.client.user.create({
        data: input,
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AuthError(
          'email_taken',
          'Ya existe una cuenta con ese email',
        );
      }
      throw error;
    }
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
    await this.prisma.client.refreshToken.create({ data: input });
  }

  rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenInput,
  ): Promise<{ userId: string } | null> {
    return this.prisma.client.$tenantTransaction(async (tx) => {
      const stored = await this.lockSession(tx, tokenHash);
      if (!stored) return null;
      const now = new Date();
      if (stored.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        // Se devuelve null para confirmar la revocación antes del 401.
        return null;
      }
      if (stored.expiresAt <= now) return null;

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: now },
      });
      await tx.refreshToken.create({
        data: {
          ...replacement,
          userId: stored.userId,
          familyId: stored.familyId,
        },
      });
      return { userId: stored.userId };
    });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.client.$tenantTransaction(async (tx) => {
      const stored = await this.lockSession(tx, tokenHash);
      if (!stored) return;
      await tx.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async lockSession(
    tx: Prisma.TransactionClient,
    tokenHash: string,
  ): Promise<RefreshToken | null> {
    const token = await tx.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
    if (!token) return null;
    // Rotación, logout y detección de reuso se serializan por familia en PostgreSQL.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${token.familyId}, 0))`;
    return tx.refreshToken.findUnique({ where: { tokenHash } });
  }
}
