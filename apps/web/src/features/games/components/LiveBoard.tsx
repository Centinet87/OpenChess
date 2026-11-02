'use client';
import { clubsApi } from '../../clubs/api/clubs.api';

import type { MemberView, Profile } from '@openchess/contracts';
import { Chess } from 'chess.js';
import { useEffect, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Topbar } from '../../auth/components/Topbar';
import { useGameSocket, type Command } from '../hooks/use-game-socket';
import { Actions } from './Actions';
import { MoveList } from './MoveList';
import { PlayerBar } from './PlayerBar';
import { Status } from './Status';

type Promotion = 'q' | 'r' | 'b' | 'n';

const PROMOTIONS: { piece: Promotion; label: string }[] = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Alfil' },
  { piece: 'n', label: 'Caballo' },
];

export function LiveBoard({
  me,
  club,
  gameId,
}: {
  me: Profile;
  club: string;
  gameId: string;
}) {
  const { game, isConnected, error, send } = useGameSocket(club, gameId);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
  } | null>(null);

  useEffect(() => {
    clubsApi.members().then(({ data }) => setMembers(data));
  }, []);

  // Cualquier vista nueva del servidor manda sobre la jugada optimista y la selección.
  useEffect(() => {
    setOptimisticFen(null);
    setSelected(null);
  }, [game?.receivedAt]);

  if (error && !game) {
    return (
      <main className="shell">
        <Topbar me={me} />
        <p className="error" role="alert">
          {error}
        </p>
        <a href="/">Volver al club</a>
      </main>
    );
  }
  if (!game) return <main className="shell" aria-busy="true" />;

  const view = game.view;
  const myColor =
    view.whiteId === me.id ? 'white' : view.blackId === me.id ? 'black' : null;
  const orientation = myColor ?? 'white';
  const top = orientation === 'white' ? 'black' : 'white';
  const nameOf = (userId: string) =>
    userId === me.id
      ? 'Tú'
      : (members.find((m) => m.userId === userId)?.displayName ?? '…');
  const nameFor = (color: 'white' | 'black') =>
    nameOf(color === 'white' ? view.whiteId : view.blackId);
  const turn = view.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const isMyTurn = view.status === 'in_progress' && myColor === turn;

  const run = async (command: Command) => {
    setActionError(null);
    const ack = await send(command);
    if (!ack.ok) {
      setOptimisticFen(null);
      setActionError(ack.message);
    }
  };

  /** Valida en local para responder al instante; el servidor tiene la última palabra. */
  const tryMove = (from: string, to: string): boolean => {
    if (!isMyTurn) return false;
    const board = new Chess(view.fen);
    const piece = board.get(from as never);
    const isPromotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
    try {
      board.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    setSelected(null);
    if (isPromotion) {
      setPendingPromotion({ from, to });
      return false;
    }
    setOptimisticFen(board.fen());
    void run({ action: 'move', from, to });
    return true;
  };

  const handleDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false);

  // Mover con dos clics: primero la pieza, después la casilla. Más cómodo en pantallas táctiles.
  const handleSquareClick = ({ square }: { square: string }) => {
    if (!isMyTurn || pendingPromotion) return;
    if (selected && selected !== square && tryMove(selected, square)) return;
    const board = new Chess(view.fen);
    const piece = board.get(square as never);
    const isOwn = piece && piece.color === turn[0];
    setSelected(isOwn && selected !== square ? square : null);
  };

  const targets = selected
    ? new Chess(view.fen)
        .moves({ square: selected as never, verbose: true })
        .map((m) => m.to)
    : [];
  const squareStyles: Record<string, CSSProperties> = {
    ...(selected
      ? { [selected]: { boxShadow: 'inset 0 0 0 4px var(--felt)' } }
      : {}),
    ...Object.fromEntries(
      targets.map((sq) => [
        sq,
        {
          background:
            'radial-gradient(circle, rgb(47 93 80 / 0.55) 22%, transparent 24%)',
        },
      ]),
    ),
  };

  const handlePromotion = (promotion: Promotion) => {
    if (!pendingPromotion) return;
    setPendingPromotion(null);
    void run({ action: 'move', ...pendingPromotion, promotion });
  };

  return (
    <main className="shell">
      <Topbar me={me} />
      <div className="game-layout">
        <div className="board-column">
          <PlayerBar game={game} color={top} name={nameFor(top)} />
          <div className="board-frame">
            <Chessboard
              options={{
                id: `game-${gameId}`,
                position: optimisticFen ?? view.fen,
                boardOrientation: orientation,
                allowDragging: isMyTurn && !pendingPromotion,
                onPieceDrop: handleDrop,
                onSquareClick: handleSquareClick,
                squareStyles,
                lightSquareStyle: { backgroundColor: 'var(--wood-light)' },
                darkSquareStyle: { backgroundColor: 'var(--wood-dark)' },
                boardStyle: { borderRadius: 2 },
              }}
            />
          </div>
          <PlayerBar
            game={game}
            color={orientation}
            name={nameFor(orientation)}
          />
          {pendingPromotion && (
            <div
              className="actions"
              role="group"
              aria-label="Elegir pieza de promoción"
            >
              {PROMOTIONS.map((p) => (
                <button
                  key={p.piece}
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handlePromotion(p.piece)}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPendingPromotion(null)}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <aside className="card">
          <span className={`conn${isConnected ? ' on' : ''}`}>
            {isConnected ? 'En vivo' : 'Reconectando…'}
          </span>
          <Status game={game} myColor={myColor} turn={turn} nameFor={nameFor} />
          {actionError && (
            <p className="error mt-(--space-3)" role="alert">
              {actionError}
            </p>
          )}
          {myColor && view.status === 'in_progress' && (
            <Actions view={view} myColor={myColor} run={run} />
          )}
          <MoveList pgn={view.pgn} />
          <p className="mt-(--space-6)">
            <a href="/">← Volver al club</a>
          </p>
        </aside>
      </div>
    </main>
  );
}
