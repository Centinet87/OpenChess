import { randomUUID } from 'node:crypto';
import { REFRESH_TTL_MS, type Session } from '../../domain/auth.types';
import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';

export class IssueSession {
  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
  ) {}

  async execute(userId: string): Promise<Session> {
    const refreshToken = this.crypto.generateToken();
    await this.repository.createRefreshToken({
      userId,
      familyId: randomUUID(),
      tokenHash: this.crypto.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    const accessToken = await this.crypto.signAccessToken({ sub: userId });
    return { accessToken, refreshToken };
  }
}
