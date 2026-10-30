import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { AuthCrypto } from '../../application/ports/auth.crypto';
import type { AccessTokenPayload } from '../../domain/auth.types';

// Parámetros mínimos que recomienda OWASP para argon2id (19 MiB, 2 pasadas).
// La librería usa argon2id por defecto.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class NodeAuthCrypto implements AuthCrypto {
  constructor(private readonly jwt: JwtService) {}

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /** Token aleatorio de 256 bits para refresh tokens, invitaciones, etc. */
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Los tokens opacos se guardan así: tienen entropía de sobra para un hash rápido. */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }
}
