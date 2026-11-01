'use client';
import { Chess } from 'chess.js';
import { useMemo } from 'react';

export function MoveList({ pgn }: { pgn: string }) {
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
