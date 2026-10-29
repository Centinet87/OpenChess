import { z } from 'zod';

// 254 es el largo máximo de una dirección de email (RFC 5321).
const email = z
  .string()
  .max(254)
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Email inválido' }));

// Máximo de 128 para que nadie mande megas a argon2.
const password = z.string().min(10, 'Mínimo 10 caracteres').max(128);

export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(60),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
