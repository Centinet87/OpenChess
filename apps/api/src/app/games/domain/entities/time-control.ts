import { GameError } from '../errors';

export type TimeControlKind = 'fischer' | 'bronstein';

/**
 * Control de tiempo (patrón Strategy): cada variante decide cuánto tiempo
 * devuelve después de una jugada.
 */
export interface TimeControl {
  readonly kind: TimeControlKind;
  readonly initialMs: number;
  readonly incrementMs: number;
  /** Tiempo que le queda al jugador después de jugar, habiendo gastado `spentMs`. */
  afterMove(remainingMs: number, spentMs: number): number;
}

/** Fischer: suma el incremento completo después de cada jugada. */
class Fischer implements TimeControl {
  readonly kind = 'fischer';
  constructor(
    readonly initialMs: number,
    readonly incrementMs: number,
  ) {}

  afterMove(remainingMs: number, spentMs: number): number {
    return remainingMs - spentMs + this.incrementMs;
  }
}

/** Bronstein: devuelve lo gastado, hasta el incremento. Nunca se gana tiempo. */
class Bronstein implements TimeControl {
  readonly kind = 'bronstein';
  constructor(
    readonly initialMs: number,
    readonly incrementMs: number,
  ) {}

  afterMove(remainingMs: number, spentMs: number): number {
    return remainingMs - spentMs + Math.min(spentMs, this.incrementMs);
  }
}

const MAX_MINUTES = 180;
const MAX_INCREMENT_S = 60;

/** Factory: "5+3" son 5 minutos con 3 segundos de incremento. */
export function timeControl(
  minutes: number,
  incrementSeconds: number,
  kind: TimeControlKind = 'fischer',
): TimeControl {
  const valid =
    Number.isFinite(minutes) &&
    Number.isInteger(incrementSeconds) &&
    minutes > 0 &&
    minutes <= MAX_MINUTES &&
    incrementSeconds >= 0 &&
    incrementSeconds <= MAX_INCREMENT_S;
  if (!valid) {
    throw new GameError(
      'INVALID_TIME_CONTROL',
      `El control de tiempo debe ser de 1 a ${MAX_MINUTES} minutos y 0 a ${MAX_INCREMENT_S} s de incremento`,
    );
  }
  const initialMs = Math.round(minutes * 60_000);
  const incrementMs = incrementSeconds * 1000;
  return kind === 'bronstein'
    ? new Bronstein(initialMs, incrementMs)
    : new Fischer(initialMs, incrementMs);
}

export function parseTimeControl(
  label: string,
  kind?: TimeControlKind,
): TimeControl {
  const match = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(label.trim());
  if (!match) {
    throw new GameError(
      'INVALID_TIME_CONTROL',
      'Formato esperado: minutos+incremento, p. ej. 5+3',
    );
  }
  return timeControl(Number(match[1]), Number(match[2]), kind);
}
