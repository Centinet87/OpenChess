import { randomUUID } from 'node:crypto';
import { AuthError } from '../domain/auth.error';
import {
  REFRESH_TTL_MS,
  type AccessTokenPayload,
  type LoginInput,
  type RegisterInput,
  type Session,
  type UserProfile,
  type ChangePasswordInput,
} from '../domain/auth.types';
import type { AuthCrypto } from './ports/auth.crypto';
import type { AuthRepository } from './ports/auth.repository';

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';
export {
  REFRESH_TTL_MS,
  REFRESH_GRACE_MS,
  type Session,
  type AccessTokenPayload,
} from '../domain/auth.types';

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

  async register(
    input: RegisterInput,
  ): Promise<{ session: Session; userId: string }> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing)
      throw new AuthError('email_taken', 'Ya existe una cuenta con ese email');

    const user = await this.repository.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash: await this.crypto.hashPassword(input.password),
    });
    return {
      session: await this.issueSession(user.id, randomUUID()),
      userId: user.id,
    };
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
   * Rota el refresh token. Si llega uno ya usado fuera de la gracia, se revoca
   * toda la familia y las dos partes tienen que volver a iniciar sesión.
   */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new AuthError('invalid_session');
    const replacement = this.crypto.generateToken();
    const rotated = await this.repository.rotateRefreshToken(
      this.crypto.hashToken(refreshToken),
      {
        tokenHash: this.crypto.hashToken(replacement),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    );
    if (!rotated) throw new AuthError('invalid_session');
    const accessToken = await this.crypto.signAccessToken({
      sub: rotated.userId,
    });
    return { accessToken, refreshToken: replacement };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.repository.revokeSession(this.crypto.hashToken(refreshToken));
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.crypto.verifyAccessToken(token);
  }

  async profile(userId: string): Promise<UserProfile> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new AuthError('user_not_found');
    return user;
  }

  async updateProfile(
    userId: string,
    input: { displayName: string },
  ): Promise<UserProfile> {
    await this.repository.updateDisplayName(userId, input.displayName);
    return this.profile(userId);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<Session> {
    const user = await this.repository.findUserCredentials(userId);
    if (
      !user ||
      !(await this.crypto.verifyPassword(
        user.passwordHash,
        input.currentPassword,
      ))
    ) {
      throw new AuthError('invalid_credentials', 'Contraseña incorrecta');
    }
    await this.repository.changePassword(
      userId,
      await this.crypto.hashPassword(input.newPassword),
    );
    return this.issueSession(userId, randomUUID());
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
}
