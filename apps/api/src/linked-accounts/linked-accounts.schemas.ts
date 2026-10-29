import { z } from 'zod';

export const platformSchema = z.enum(['lichess', 'chesscom']);

// El formato fino lo valida el dominio (normalizeUsername).
export const usernameSchema = z.object({ username: z.string().max(40) });

export const importSchema = z.object({ platform: platformSchema });

export const listImportsSchema = z.object({ userId: z.uuid().optional() });

export const oauthCallbackSchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(128).optional(),
  error: z.string().max(128).optional(),
});
