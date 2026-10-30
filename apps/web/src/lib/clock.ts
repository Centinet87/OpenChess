import type { LiveGame } from './use-game-socket';

export type Color = 'white' | 'black';

/**
 * Tiempo que le queda a `color` en este momento. El servidor manda los tiempos
 * ya descontados; aquí solo se sigue descontando desde que llegó la vista.
 */
export function remainingMs(game: LiveGame, color: Color, now: number): number {
  const { clock, status } = game.view;
  const stored = color === 'white' ? clock.whiteMs : clock.blackMs;
  if (status !== 'in_progress' || clock.running !== color) return stored;
  return Math.max(0, stored - (now - game.receivedAt));
}

/** 5:03, y con décimas por debajo de 10 s: 9.4 */
export function formatClock(ms: number): string {
  if (ms < 10_000) return (Math.floor(ms / 100) / 10).toFixed(1);
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
