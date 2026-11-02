'use client';
import { type LiveGame } from '../hooks/use-game-socket';

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

type StatusProps = {
  game: LiveGame;
  myColor: 'white' | 'black' | null;
  turn: 'white' | 'black';
  nameFor: (c: 'white' | 'black') => string;
};

export function Status({ game, myColor, turn, nameFor }: StatusProps) {
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
