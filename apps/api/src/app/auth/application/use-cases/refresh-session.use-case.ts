import { AuthError } from '../../domain/auth.error';
import { REFRESH_TTL_MS, type Session } from '../../domain/auth.types';
import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';

export class RefreshSessionUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
  ) {}

  async execute(refreshToken: string | undefined): Promise<Session> {
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
}
