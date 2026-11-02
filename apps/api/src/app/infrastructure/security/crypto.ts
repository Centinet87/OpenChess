import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Parámetros mínimos que recomienda OWASP para argon2id (19 MiB, 2 pasadas).
// La librería usa argon2id por defecto.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Un hash que no es PHC válido cuenta como contraseña incorrecta, no como error 500. */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Token aleatorio de 256 bits para refresh tokens, invitaciones, etc. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Los tokens opacos se guardan así: tienen entropía de sobra para un hash rápido. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
