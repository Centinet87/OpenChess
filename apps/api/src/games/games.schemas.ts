import { z } from 'zod';

export const challengeSchema = z.object({
  opponentId: z.uuid(),
  // El rango fino lo valida el dominio (parseTimeControl).
  timeControl: z.string().max(10),
  color: z.enum(['white', 'black', 'random']).default('random'),
});

export const listSchema = z.object({
  status: z
    .string()
    .default('pending,in_progress')
    .transform((s) => s.split(','))
    .pipe(
      z
        .array(z.enum(['pending', 'in_progress', 'finished']))
        .min(1)
        .max(3),
    ),
});

const square = z.string().regex(/^[a-h][1-8]$/);

/** Mensajes del WebSocket. */
export const joinSchema = z.object({
  club: z.string().min(1).max(64),
  gameId: z.uuid(),
});

export const commandSchema = z.discriminatedUnion('action', [
  z.object({
    gameId: z.uuid(),
    action: z.literal('move'),
    from: square,
    to: square,
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  }),
  z.object({
    gameId: z.uuid(),
    action: z.enum([
      'resign',
      'abort',
      'offerDraw',
      'acceptDraw',
      'declineDraw',
    ]),
  }),
]);

export type ChallengeInput = z.infer<typeof challengeSchema>;
export type CommandInput = z.infer<typeof commandSchema>;
