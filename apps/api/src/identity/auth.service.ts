import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantPrisma } from '../infrastructure/prisma.module';
import type { LoginInput, RegisterInput } from './auth.schemas';
import {
  generateOpaqueToken,
  hashPassword,
  sha256,
  verifyPassword,
} from './crypto';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
}

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

@Injectable()
export class AuthService implements OnModuleInit {
  /** Se verifica contra este hash cuando el email no existe, para que ambos casos tarden lo mismo. */
  private dummyHash = '';

  constructor(
    private readonly prisma: TenantPrisma,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(generateOpaqueToken());
  }

  async register(input: RegisterInput): Promise<Session> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('Ya existe una cuenta con ese email');

    const user = await this.prisma.client.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
      },
      select: { id: true },
    });
    return this.issueSession(user.id, randomUUID());
  }

  async login(input: LoginInput): Promise<Session> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    );
    if (!user || !ok) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return this.issueSession(user.id, randomUUID());
  }

  /**
   * Rota el refresh token. Si llega uno ya usado, alguien lo copió: se revoca
   * toda la familia y las dos partes tienen que volver a iniciar sesión.
   */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException();
    const tokens = this.prisma.client.refreshToken;
    const stored = await tokens.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored) throw new UnauthorizedException();

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException();
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException();

    // Condicionado a revokedAt null: si dos requests rotan a la vez, solo una gana.
    const { count } = await tokens.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException();
    }
    return this.issueSession(stored.userId, stored.familyId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  private async issueSession(
    userId: string,
    familyId: string,
  ): Promise<Session> {
    const refreshToken = generateOpaqueToken();
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const accessToken = await this.jwt.signAsync({
      sub: userId,
    } satisfies AccessTokenPayload);
    return { accessToken, refreshToken };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
