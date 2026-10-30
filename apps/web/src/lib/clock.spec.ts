import { formatClock, remainingMs } from './clock';
import type { LiveGame } from './use-game-socket';

function live(
  running: 'white' | 'black' | null,
  status = 'in_progress',
): LiveGame {
  return {
    receivedAt: 1_000,
    view: {
      status,
      clock: { whiteMs: 60_000, blackMs: 30_000, running },
    } as LiveGame['view'],
  };
}

describe('reloj del cliente', () => {
  it('descuenta solo al color que corre, desde que llegó la vista', () => {
    expect(remainingMs(live('black'), 'black', 6_000)).toBe(25_000);
    expect(remainingMs(live('black'), 'white', 6_000)).toBe(60_000);
  });

  it('no baja de cero ni corre si la partida terminó', () => {
    expect(remainingMs(live('black'), 'black', 99_000)).toBe(0);
    expect(remainingMs(live('black', 'finished'), 'black', 6_000)).toBe(30_000);
  });

  it('formato m:ss y décimas bajo 10 s', () => {
    expect(formatClock(303_000)).toBe('5:03');
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(9_460)).toBe('9.4');
    expect(formatClock(0)).toBe('0.0');
  });
});
