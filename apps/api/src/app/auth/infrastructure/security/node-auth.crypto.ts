import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  hashPassword,
  verifyPassword,
  generateOpaqueToken,
  sha256,
} from '../../../infrastructure/security/crypto';
import type { AuthCrypto } from '../../application/security/auth.crypto';
import type { AccessTokenPayload } from '../../domain/auth.types';

@Injectable()
export class NodeAuthCrypto implements AuthCrypto {
  constructor(private readonly jwt: JwtService) {}

  hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return verifyPassword(passwordHash, password);
  }

  /** Token aleatorio de 256 bits para refresh tokens, invitaciones, etc. */
  generateToken(): string {
    return generateOpaqueToken();
  }

  /** Los tokens opacos se guardan así: tienen entropía de sobra para un hash rápido. */
  hashToken(token: string): string {
    return sha256(token);
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }
}
