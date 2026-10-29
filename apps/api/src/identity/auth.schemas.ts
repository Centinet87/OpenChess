import { z } from 'zod';

// 254 es el largo máximo de una dirección de email (RFC 5321).
const email = z
  .string()
  .max(254)
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Email inválido' }));

// Máximo de 128 para que nadie mande megas a argon2.
export const password = z.string().min(10, 'Mínimo 10 caracteres').max(128);

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

const token = z.string().min(10).max(200);

export const tokenSchema = z.object({ token });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token, password });

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
