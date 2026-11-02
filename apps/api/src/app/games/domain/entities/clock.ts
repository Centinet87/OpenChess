import type { TimeControl } from './time-control';

export type Color = 'white' | 'black';

export const opposite = (c: Color): Color =>
  c === 'white' ? 'black' : 'white';

export interface ClockState {
  readonly whiteMs: number;
  readonly blackMs: number;
  /** Color cuyo tiempo corre, o null si el reloj está detenido. */
  readonly running: Color | null;
  /** Epoch ms en que empezó a correr el turno actual. */
  readonly since: number | null;
}

/**
 * Reloj de la partida. El servidor es la única fuente de verdad: el cliente
 * solo muestra lo que el servidor calcula con su propio `now`.
 */
export class Clock {
  private constructor(
    readonly state: ClockState,
    private readonly control: TimeControl,
  ) {}

  static initial(control: TimeControl): Clock {
    return new Clock(
      {
        whiteMs: control.initialMs,
        blackMs: control.initialMs,
        running: null,
        since: null,
      },
      control,
    );
  }

  static restore(state: ClockState, control: TimeControl): Clock {
    return new Clock(state, control);
  }

  remaining(color: Color, now: number): number {
    const stored = color === 'white' ? this.state.whiteMs : this.state.blackMs;
    if (this.state.running !== color || this.state.since === null)
      return stored;
    return Math.max(0, stored - (now - this.state.since));
  }

  /** Color sin tiempo, si lo hay. */
  flagged(now: number): Color | null {
    const running = this.state.running;
    return running && this.remaining(running, now) === 0 ? running : null;
  }

  /** Empieza a correr el tiempo de `color` sin descontar a nadie (primera jugada). */
  start(color: Color, now: number): Clock {
    return new Clock(
      { ...this.state, running: color, since: now },
      this.control,
    );
  }

  /** `mover` terminó su jugada: se le descuenta lo gastado y empieza a correr el rival. */
  press(mover: Color, now: number): Clock {
    const since = this.state.running === mover ? this.state.since : null;
    const spent = since === null ? 0 : now - since;
    const before = mover === 'white' ? this.state.whiteMs : this.state.blackMs;
    const after =
      since === null ? before : this.control.afterMove(before, spent);
    const key = mover === 'white' ? 'whiteMs' : 'blackMs';
    return new Clock(
      { ...this.state, [key]: after, running: opposite(mover), since: now },
      this.control,
    );
  }

  /** Congela los tiempos al terminar la partida. */
  stop(now: number): Clock {
    return new Clock(
      {
        whiteMs: this.remaining('white', now),
        blackMs: this.remaining('black', now),
        running: null,
        since: null,
      },
      this.control,
    );
  }
}
