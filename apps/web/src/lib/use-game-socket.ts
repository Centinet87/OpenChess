'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  GAME_EVENTS,
  GAMES_NAMESPACE,
  type GameAck,
  type GameUpdate,
  type GameView,
} from '@openchess/contracts';
import { refreshSession } from './api';
import { socketUrl } from './host';

export type Command =
  | {
      action: 'move';
      from: string;
      to: string;
      promotion?: 'q' | 'r' | 'b' | 'n';
    }
  | { action: 'resign' | 'abort' | 'offerDraw' | 'acceptDraw' | 'declineDraw' };

/** La respuesta del servidor, o OFFLINE si ni siquiera se pudo mandar. */
export type Ack = GameAck | { ok: false; code: 'OFFLINE'; message: string };

/** La vista del servidor más el momento local en que llegó, para que el reloj corra en el cliente. */
export interface LiveGame {
  view: GameView;
  receivedAt: number;
}

/**
 * Conexión en vivo a una partida. Se une al conectar y otra vez al reconectar,
 * así una caída de red no deja al jugador mirando una posición vieja.
 */
export function useGameSocket(club: string, gameId: string) {
  const [game, setGame] = useState<LiveGame | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${socketUrl()}${GAMES_NAMESPACE}`, {
      transports: ['websocket'],
      withCredentials: true,
    });
    socketRef.current = socket;
    const apply = (view: GameView) => setGame({ view, receivedAt: Date.now() });

    socket.on('connect', async () => {
      setIsConnected(true);
      const ack: Ack = await socket
        .timeout(5000)
        .emitWithAck(GAME_EVENTS.join, { club, gameId });
      if (ack.ok) {
        setError(null);
        apply(ack.game);
      } else {
        setError(ack.message);
      }
    });
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', async (err) => {
      setIsConnected(false);
      // El access token dura 15 min: se renueva y se reintenta. Socket.IO no
      // reconecta solo cuando el rechazo viene del middleware del servidor.
      if (err.message === 'Inicia sesión') {
        try {
          await refreshSession();
          socket.connect();
        } catch {
          setError('Tu sesión venció. Vuelve a entrar.');
        }
      }
    });
    socket.on(GAME_EVENTS.update, ({ game: view }: GameUpdate) => {
      if (view.id === gameId) apply(view);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [club, gameId]);

  const send = useCallback(
    async (command: Command): Promise<Ack> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        return {
          ok: false,
          code: 'OFFLINE',
          message: 'Sin conexión. Reintentando…',
        };
      }
      const ack: Ack = await socket
        .timeout(5000)
        .emitWithAck(GAME_EVENTS.command, {
          gameId,
          ...command,
        });
      if (ack.ok) setGame({ view: ack.game, receivedAt: Date.now() });
      return ack;
    },
    [gameId],
  );

  return { game, isConnected, error, send };
}
