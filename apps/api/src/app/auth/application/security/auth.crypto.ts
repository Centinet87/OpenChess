import type { AccessTokenPayload } from '../../domain/auth.types';

export interface AuthCrypto {
  hashPassword(password: string): Promise<string>;
  verifyPassword(passwordHash: string, password: string): Promise<boolean>;
  generateToken(): string;
  hashToken(token: string): string;
  signAccessToken(payload: AccessTokenPayload): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenPayload>;
}
