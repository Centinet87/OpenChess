import {
  parseChessComGame,
  parseChessComProfile,
  type ChessComGame,
} from './chesscom';
import {
  parseLichessGame,
  parseLichessUser,
  pkcePair,
  type LichessGame,
} from './lichess';
import { createHash } from 'node:crypto';

describe('Lichess', () => {
  it('perfil: toma los ritmos jugados y descarta cuentas cerradas', () => {
    const profile = parseLichessUser({
      id: 'magnus',
      username: 'Magnus',
      perfs: {
        bullet: { rating: 3100, games: 500 },
        blitz: { rating: 3000, games: 900 },
        rapid: { rating: 1500, games: 0 },
        correspondence: { rating: 2000, games: 3 },
        puzzle: { rating: 2500, games: 10 },
      },
    });
    expect(profile).toEqual({
      displayName: 'Magnus',
      ratings: { bullet: 3100, blitz: 3000, daily: 2000 },
      editableText: '',
    });
    expect(
      parseLichessUser({ id: 'x', username: 'X', disabled: true }),
    ).toBeNull();
    expect(
      parseLichessUser({ id: 'x', username: 'X', tosViolation: true }),
    ).toBeNull();
  });

  const base: LichessGame = {
    id: 'q7ZvsdUF',
    variant: 'standard',
    speed: 'blitz',
    status: 'mate',
    createdAt: 1_761_000_000_000,
    lastMoveAt: 1_761_000_300_000,
    players: {
      white: { user: { id: 'ana', name: 'Ana' } },
      black: { user: { id: 'beto', name: 'Beto' } },
    },
    winner: 'white',
    pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
  };

  it('partida: resultado, jugadores, variante y fecha', () => {
    expect(parseLichessGame(base)).toEqual({
      platform: 'lichess',
      externalId: 'q7ZvsdUF',
      url: 'https://lichess.org/q7ZvsdUF',
      white: 'ana',
      black: 'beto',
      whiteName: 'Ana',
      blackName: 'Beto',
      result: '1-0',
      speed: 'blitz',
      standard: true,
      pgn: base.pgn,
      playedAt: new Date(1_761_000_300_000),
    });
  });

  it('tablas, abortadas, Chess960 y la computadora', () => {
    const noWinner = { ...base, winner: undefined };
    expect(parseLichessGame({ ...noWinner, status: 'stalemate' }).result).toBe(
      '1/2-1/2',
    );
    expect(parseLichessGame({ ...noWinner, status: 'aborted' }).result).toBe(
      null,
    );
    expect(parseLichessGame({ ...base, variant: 'chess960' }).standard).toBe(
      false,
    );
    const vsAi = parseLichessGame({
      ...base,
      players: { ...base.players, black: {} },
    });
    expect(vsAi).toMatchObject({ black: null, blackName: 'Computadora' });
  });

  it('PKCE: el challenge es el SHA-256 del verifier en base64url', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
  });
});

describe('Chess.com', () => {
  it('perfil: el nombre como lo escribe la persona, los ratings y los campos editables', () => {
    const profile = parseChessComProfile(
      {
        username: 'hikaru',
        url: 'https://www.chess.com/member/Hikaru',
        name: 'Hikaru Nakamura',
        location: 'Florida openchess-1a2b3c4d',
        status: 'premium',
      },
      {
        chess_bullet: { last: { rating: 3300 } },
        chess_blitz: { last: { rating: 3200 } },
        chess_daily: {},
        tactics: { last: { rating: 3000 } },
      },
    );
    expect(profile).toEqual({
      displayName: 'Hikaru',
      ratings: { bullet: 3300, blitz: 3200 },
      editableText: 'Florida openchess-1a2b3c4d Hikaru Nakamura',
    });
  });

  it('perfil: una cuenta cerrada no existe', () => {
    expect(
      parseChessComProfile(
        {
          username: 'x',
          url: 'https://www.chess.com/member/x',
          status: 'closed:fair_play_violations',
        },
        null,
      ),
    ).toBeNull();
  });

  const base: ChessComGame = {
    url: 'https://www.chess.com/game/live/123456789',
    uuid: '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab',
    pgn: '[Event "Live Chess"]\n\n1. e4 e5 1-0',
    time_class: 'rapid',
    rules: 'chess',
    end_time: 1_761_000_000,
    white: { username: 'Ana_C', result: 'win' },
    black: { username: 'Beto', result: 'resigned' },
  };

  it('partida: resultado, jugadores y fecha', () => {
    expect(parseChessComGame(base)).toEqual({
      platform: 'chesscom',
      externalId: base.uuid,
      url: base.url,
      white: 'ana_c',
      black: 'beto',
      whiteName: 'Ana_C',
      blackName: 'Beto',
      result: '1-0',
      speed: 'rapid',
      standard: true,
      pgn: base.pgn,
      playedAt: new Date(1_761_000_000_000),
    });
  });

  it('tablas, derrota de las blancas y Chess960', () => {
    expect(
      parseChessComGame({
        ...base,
        white: { username: 'a', result: 'repetition' },
        black: { username: 'b', result: 'repetition' },
      }).result,
    ).toBe('1/2-1/2');
    expect(
      parseChessComGame({
        ...base,
        white: { username: 'a', result: 'timeout' },
        black: { username: 'b', result: 'win' },
      }).result,
    ).toBe('0-1');
    expect(parseChessComGame({ ...base, rules: 'chess960' }).standard).toBe(
      false,
    );
  });
});
