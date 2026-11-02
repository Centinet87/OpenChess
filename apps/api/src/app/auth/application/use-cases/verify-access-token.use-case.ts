import type { AccessTokenPayload } from '../../domain/auth.types';
import type { AuthCrypto } from '../security/auth.crypto';

export class VerifyAccessTokenUseCase {
  constructor(private readonly crypto: AuthCrypto) {}

  execute(token: string): Promise<AccessTokenPayload> {
    return this.crypto.verifyAccessToken(token);
  }
}
