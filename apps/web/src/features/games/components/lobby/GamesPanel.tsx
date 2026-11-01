'use client';
import { gamesApi } from '../../api/games.api';

import type { GameView, Profile } from '@openchess/contracts';
import { useState } from 'react';
import { errorMessage } from '../../../../shared/api/client';

type GamesPanelProps = {
  me: Profile;
  games: GameView[];
  nameOf: (userId: string) => string;
  onChange: () => void;
};

export function GamesPanel({ me, games, nameOf, onChange }: GamesPanelProps) {
  const [error, setError] = useState<string | null>(null);

  const respond = async (gameId: string, action: 'accept' | 'decline') => {
    setError(null);
    try {
      await gamesApi.respond(gameId, action);
      if (action === 'accept') window.location.href = `/games/${gameId}`;
      else onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="card" aria-labelledby="games-title">
      <div className="section-head">
        <h2 id="games-title">Partidas</h2>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {games.length === 0 && (
        <p className="empty">No hay partidas en curso ni desafíos.</p>
      )}
      <ul className="list">
        {games.map((g) => {
          const isMine = g.whiteId === me.id || g.blackId === me.id;
          const isForMe =
            g.status === 'pending' && isMine && g.challengerId !== me.id;
          const minutes = g.timeControl.initialMs / 60_000;
          const label = `${minutes}+${g.timeControl.incrementMs / 1000}`;
          return (
            <li key={g.id}>
              <div>
                <strong>
                  {nameOf(g.whiteId)} <span className="muted">vs</span>{' '}
                  {nameOf(g.blackId)}
                </strong>
                <div className="muted text-[0.875rem]">
                  {label} ·{' '}
                  {g.status === 'pending' ? 'desafío pendiente' : 'en juego'}
                </div>
              </div>
              <div className="actions mt-0">
                {isForMe && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => respond(g.id, 'accept')}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => respond(g.id, 'decline')}
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {g.status === 'pending' && g.challengerId === me.id && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => respond(g.id, 'decline')}
                  >
                    Cancelar
                  </button>
                )}
                {g.status === 'in_progress' && (
                  <a className="btn btn-sm" href={`/games/${g.id}`}>
                    {isMine ? 'Jugar' : 'Mirar'}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
