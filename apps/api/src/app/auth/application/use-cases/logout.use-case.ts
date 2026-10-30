import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';

export class LogoutUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
  ) {}

  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.repository.revokeSession(this.crypto.hashToken(refreshToken));
  }
}
