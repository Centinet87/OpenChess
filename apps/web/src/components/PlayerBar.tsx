'use client';

import { useEffect, useState } from 'react';
import { formatClock, remainingMs, type Color } from '../lib/clock';
import type { LiveGame } from '../lib/use-game-socket';

const LOW_TIME_MS = 20_000;

type Props = {
  game: LiveGame;
  color: Color;
  name: string;
};

export function PlayerBar({ game, color, name }: Props) {
  const isRunning =
    game.view.status === 'in_progress' && game.view.clock.running === color;
  const [now, setNow] = useState(() => Date.now());

  // Solo el reloj que corre se redibuja, 10 veces por segundo.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [isRunning]);

  const ms = remainingMs(game, color, isRunning ? now : game.receivedAt);
  const className = [
    'clock',
    isRunning && 'running',
    isRunning && ms < LOW_TIME_MS && 'low',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="player-bar">
      <span className="player-name">
        <span className={`piece-dot ${color}`} aria-hidden="true" />
        {name}
      </span>
      <span
        className={className}
        role="timer"
        aria-label={`Reloj de ${name}: ${formatClock(ms)}`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}
