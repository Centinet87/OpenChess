import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import type {
  AuthRepository,
  CreateRefreshTokenInput,
  CreateUserInput,
} from '../../application/ports/auth.repository';
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

  createUser(input: CreateUserInput): Promise<{ id: string }> {
    return this.prisma.client.user.create({
      data: input,
      select: { id: true },
    });
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
    await this.prisma.client.refreshToken.create({ data: input });
  }

  async revokeRefreshToken(id: string, revokedAt: Date): Promise<number> {
    const { count } = await this.prisma.client.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
    return count;
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
