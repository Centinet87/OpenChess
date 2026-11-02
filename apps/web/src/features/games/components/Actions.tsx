'use client';
import type { GameView } from '@openchess/contracts';
import { Chess } from 'chess.js';
import { useMemo, useState } from 'react';
import { type Command } from '../hooks/use-game-socket';

type ActionsProps = {
  view: GameView;
  myColor: 'white' | 'black';
  run: (command: Command) => Promise<void>;
};

export function Actions({ view, myColor, run }: ActionsProps) {
  const plies = useMemo(() => {
    const board = new Chess();
    if (view.pgn) board.loadPgn(view.pgn);
    return board.history().length;
  }, [view.pgn]);
  const offeredByRival =
    view.drawOfferBy !== null && view.drawOfferBy !== myColor;
  const offeredByMe = view.drawOfferBy === myColor;
  // Confirmación dentro de la página: window.confirm se bloquea en navegadores
  // integrados (devuelve false sin mostrar nada) y el botón no hacía nada.
  const [isConfirmingResign, setIsConfirmingResign] = useState(false);

  if (isConfirmingResign) {
    return (
      <div
        className="notice"
        role="alertdialog"
        aria-label="Confirmar rendición"
      >
        ¿Seguro que quieres rendirte? Pierdes la partida.
        <div className="actions">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              setIsConfirmingResign(false);
              void run({ action: 'resign' });
            }}
          >
            Sí, me rindo
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            autoFocus
            onClick={() => setIsConfirmingResign(false)}
          >
            Seguir jugando
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {offeredByRival && (
        <div className="notice" role="status">
          Tu rival ofrece tablas.
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => run({ action: 'acceptDraw' })}
            >
              Aceptar tablas
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => run({ action: 'declineDraw' })}
            >
              Seguir jugando
            </button>
          </div>
        </div>
      )}
      <div className="actions">
        {plies < 2 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => run({ action: 'abort' })}
          >
            Abortar
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={offeredByMe}
            onClick={() => run({ action: 'offerDraw' })}
          >
            {offeredByMe ? 'Tablas ofrecidas' : 'Ofrecer tablas'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setIsConfirmingResign(true)}
        >
          Rendirse
        </button>
      </div>
    </>
  );
}
