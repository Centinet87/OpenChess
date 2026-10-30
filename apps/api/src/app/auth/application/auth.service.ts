import { randomUUID } from 'node:crypto';
import { AuthError } from '../domain/auth.error';
import {
  REFRESH_TTL_MS,
  type AccessTokenPayload,
  type LoginInput,
  type RegisterInput,
  type Session,
  type UserProfile,
} from '../domain/auth.types';
import type { AuthCrypto } from './ports/auth.crypto';
import type { AuthRepository } from './ports/auth.repository';

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

export class AuthService {
  /** Se verifica contra este hash cuando el email no existe, para que ambos casos tarden lo mismo. */
  private dummyHash = '';

  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
  ) {}

  async initialize(): Promise<void> {
    this.dummyHash = await this.crypto.hashPassword(
      this.crypto.generateToken(),
    );
  }

  async register(input: RegisterInput): Promise<Session> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing)
      throw new AuthError('email_taken', 'Ya existe una cuenta con ese email');

    const user = await this.repository.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash: await this.crypto.hashPassword(input.password),
    });
    return this.issueSession(user.id, randomUUID());
  }

  async login(input: LoginInput): Promise<Session> {
    const user = await this.repository.findUserByEmail(input.email);
    const ok = await this.crypto.verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    );
    if (!user || !ok)
      throw new AuthError('invalid_credentials', INVALID_CREDENTIALS);
    return this.issueSession(user.id, randomUUID());
  }

  /**
   * Rota el refresh token. Si llega uno ya usado, alguien lo copió: se revoca
   * toda la familia y las dos partes tienen que volver a iniciar sesión.
   */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new AuthError('invalid_session');
    const stored = await this.repository.findRefreshToken(
      this.crypto.hashToken(refreshToken),
    );
    if (!stored) throw new AuthError('invalid_session');

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new AuthError('invalid_session');
    }
    if (stored.expiresAt <= new Date()) throw new AuthError('invalid_session');

    // Condicionado a revokedAt null: si dos requests rotan a la vez, solo una gana.
    const count = await this.repository.revokeRefreshToken(
      stored.id,
      new Date(),
    );
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new AuthError('invalid_session');
    }
    return this.issueSession(stored.userId, stored.familyId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.repository.findRefreshToken(
      this.crypto.hashToken(refreshToken),
    );
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.crypto.verifyAccessToken(token);
  }

  async me(userId: string): Promise<UserProfile> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AuthError('user_not_found');
    return user;
  }

  private async issueSession(
    userId: string,
    familyId: string,
  ): Promise<Session> {
    const refreshToken = this.crypto.generateToken();
    await this.repository.createRefreshToken({
      userId,
      familyId,
      tokenHash: this.crypto.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    const accessToken = await this.crypto.signAccessToken({
      sub: userId,
    } satisfies AccessTokenPayload);
    return { accessToken, refreshToken };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.repository.revokeFamily(familyId, new Date());
  }
}
