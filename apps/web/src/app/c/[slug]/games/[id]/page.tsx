'use client';

import { Chess } from 'chess.js';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { PlayerBar } from '../../../../../components/PlayerBar';
import { Topbar } from '../../../../../components/Topbar';
import {
  api,
  type GameView,
  type Profile,
  type MemberView,
} from '../../../../../lib/api';
import {
  useGameSocket,
  type Command,
  type LiveGame,
} from '../../../../../lib/use-game-socket';
import { useMe } from '../../../../../lib/use-me';

type Promotion = 'q' | 'r' | 'b' | 'n';
const PROMOTIONS: { piece: Promotion; label: string }[] = [
  { piece: 'q', label: 'Dama' },
  { piece: 'r', label: 'Torre' },
  { piece: 'b', label: 'Alfil' },
  { piece: 'n', label: 'Caballo' },
];

const TERMINATION: Record<string, string> = {
  checkmate: 'por jaque mate',
  resignation: 'por abandono',
  timeout: 'por tiempo',
  stalemate: 'por ahogado',
  repetition: 'por triple repetición',
  fifty_moves: 'por la regla de 50 jugadas',
  insufficient_material: 'por material insuficiente',
  agreement: 'de común acuerdo',
  aborted: '',
  declined: '',
};

export default function GamePage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const session = useMe();

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    // Sin sesión no hay WebSocket: se vuelve a la portada del club, que pide entrar.
    if (typeof window !== 'undefined') window.location.replace('/');
    return null;
  }
  return <LiveBoard me={session.me} club={slug} gameId={id} />;
}

function LiveBoard({
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
    api.get<MemberView[]>('/club/members').then(({ data }) => setMembers(data));
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
            <p
              className="error"
              role="alert"
              style={{ marginTop: 'var(--space-3)' }}
            >
              {actionError}
            </p>
          )}
          {myColor && view.status === 'in_progress' && (
            <Actions view={view} myColor={myColor} run={run} />
          )}
          <MoveList pgn={view.pgn} />
          <p style={{ marginTop: 'var(--space-6)' }}>
            <a href="/">← Volver al club</a>
          </p>
        </aside>
      </div>
    </main>
  );
}

type StatusProps = {
  game: LiveGame;
  myColor: 'white' | 'black' | null;
  turn: 'white' | 'black';
  nameFor: (c: 'white' | 'black') => string;
};

function Status({ game, myColor, turn, nameFor }: StatusProps) {
  const { view } = game;
  if (view.status === 'finished') {
    if (view.termination === 'aborted')
      return <p className="status-banner">Partida abortada</p>;
    if (view.termination === 'declined')
      return <p className="status-banner">Desafío rechazado</p>;
    const how = TERMINATION[view.termination ?? ''] ?? '';
    const title =
      view.result === '1/2-1/2'
        ? 'Tablas'
        : `Ganan ${view.result === '1-0' ? 'las blancas' : 'las negras'}`;
    return (
      <>
        <p className="status-banner">{title}</p>
        <p className="muted">
          {view.result} {how}
        </p>
      </>
    );
  }
  if (view.status === 'pending') {
    return <p className="status-banner">Esperando que acepten el desafío</p>;
  }
  const whose = myColor === turn ? 'Te toca' : `Juega ${nameFor(turn)}`;
  return (
    <>
      <p className="status-banner">{whose}</p>
      {view.pgn === '' && myColor === 'white' && (
        <p className="muted">
          Tu primera jugada no gasta reloj
          {view.firstMoveBy &&
            `, pero si no juegas en ${Math.max(0, Math.round((view.firstMoveBy - view.serverNow) / 1000))} s la partida se aborta`}
          .
        </p>
      )}
    </>
  );
}

type ActionsProps = {
  view: GameView;
  myColor: 'white' | 'black';
  run: (command: Command) => Promise<void>;
};

function Actions({ view, myColor, run }: ActionsProps) {
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

function MoveList({ pgn }: { pgn: string }) {
  const moves = useMemo(() => {
    const board = new Chess();
    if (pgn) board.loadPgn(pgn);
    return board.history();
  }, [pgn]);

  if (moves.length === 0) return null;
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => i);
  return (
    <div className="moves" aria-label="Jugadas">
      {rows.map((i) => (
        <MoveRow
          key={i}
          number={i + 1}
          white={moves[i * 2]}
          black={moves[i * 2 + 1]}
        />
      ))}
    </div>
  );
}

function MoveRow({
  number,
  white,
  black,
}: {
  number: number;
  white?: string;
  black?: string;
}) {
  return (
    <>
      <span className="num">{number}.</span>
      <span>{white}</span>
      <span>{black ?? ''}</span>
    </>
  );
}
