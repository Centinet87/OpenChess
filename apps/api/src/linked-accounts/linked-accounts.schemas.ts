import { z } from 'zod';

/** Query con que vuelve Lichess al terminar el OAuth (no lo manda el front). */
export const oauthCallbackSchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(128).optional(),
  error: z.string().max(128).optional(),
});
