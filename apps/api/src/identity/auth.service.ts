import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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

export interface Profile {
  id: string;
  email: string;
  displayName: string;
}

export interface AccessTokenPayload {
  sub: string;
  /** Vencimiento en segundos (lo agrega jsonwebtoken al firmar). */
  exp?: number;
}

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
const EMAIL_TAKEN = 'Ya existe una cuenta con ese email';

@Injectable()
export class AuthService {
  /** Se verifica contra este hash cuando el email no existe, para que ambos casos tarden lo mismo. */
  private readonly dummyHash = hashPassword(generateOpaqueToken());

  constructor(
    private readonly prisma: TenantPrisma,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<Session> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException(EMAIL_TAKEN);

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.client.user
      .create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
        },
        select: { id: true },
      })
      .catch((error: unknown) => {
        // Dos registros simultáneos con el mismo email: el segundo choca con el índice único.
        if ((error as { code?: string }).code === 'P2002')
          throw new ConflictException(EMAIL_TAKEN);
        throw error;
      });
    return this.issueSession(user.id, randomUUID());
  }

  async login(input: LoginInput): Promise<Session> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
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

    // Primero se emite el nuevo: si eso falla, el viejo sigue sirviendo y nadie
    // pierde la sesión por un error pasajero de la BD.
    const session = await this.issueSession(stored.userId, stored.familyId);

    // Condicionado a revokedAt null: si dos requests rotan a la vez, solo una gana.
    // La que pierde revoca la familia, incluido el token que acaba de emitir.
    const { count } = await tokens.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException();
    }
    return session;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async profile(userId: string): Promise<Profile> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) throw new NotFoundException();
    return user;
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
