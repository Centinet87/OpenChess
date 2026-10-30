import { GameError } from '../domain/errors.js';
import type { GameEvent, GameSnapshot, GameStatus } from '../domain/game.js';
import {
  CHALLENGE_TTL_MS,
  GamesUseCases,
  MAX_OPEN_CHALLENGES,
} from './games.use-cases.js';
import type { GamesRepository, StoredGame } from './ports.js';

class MemoryGames implements GamesRepository {
  rows = new Map<string, StoredGame>();
  /** Simula que otra request guardó justo antes, las primeras N veces. */
  conflictsLeft = 0;

  /** Reloj de los desafíos: lo fija el test. */
  clock = 0;

  async insert(snapshot: GameSnapshot) {
    this.rows.set(snapshot.id, { snapshot, version: 0, createdAt: this.clock });
  }
  async find(id: string) {
    return this.rows.get(id) ?? null;
  }
  async update(snapshot: GameSnapshot, expectedVersion: number) {
    const row = this.rows.get(snapshot.id);
    if (this.conflictsLeft > 0) {
      this.conflictsLeft--;
      if (row)
        this.rows.set(row.snapshot.id, { ...row, version: row.version + 1 });
      return false;
    }
    if (!row || row.version !== expectedVersion) return false;
    this.rows.set(snapshot.id, {
      ...row,
      snapshot,
      version: expectedVersion + 1,
    });
    return true;
  }
  async list(
    clubId: string,
    statuses: readonly GameStatus[],
    _limit: number,
    pendingSince: number,
  ) {
    return [...this.rows.values()]
      .filter(
        (r) => r.snapshot.status !== 'pending' || r.createdAt >= pendingSince,
      )
      .map((r) => r.snapshot)
      .filter((s) => s.clubId === clubId && statuses.includes(s.status));
  }
  async countPending(clubId: string, challengerId: string, since: number) {
    return [...this.rows.values()].filter(
      (r) =>
        r.snapshot.clubId === clubId &&
        r.snapshot.challengerId === challengerId &&
        r.snapshot.status === 'pending' &&
        r.createdAt >= since,
    ).length;
  }
}

function setup() {
  const games = new MemoryGames();
  const published: GameEvent[] = [];
  let now = 0;
  const useCases = new GamesUseCases({
    games,
    members: { isMember: async (_club, user) => user !== 'outsider' },
    publisher: { publish: (_g, events) => published.push(...events) },
    newId: () => `g${games.rows.size + 1}`,
    now: () => (now += 1000),
    random: () => 0.9,
  });
  return {
    useCases,
    games,
    published,
    /** Avanza el reloj y fecha ahí los desafíos nuevos. */
    advance: (ms: number) => (games.clock = now += ms),
  };
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return e instanceof GameError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('GamesUseCases', () => {
  it('desafío, aceptación y jugada publican sus eventos', async () => {
    const { useCases, published } = setup();
    const game = await useCases.challenge('club', 'ana', {
      opponentId: 'beto',
      timeControl: '5+3',
      color: 'white',
    });
    expect(game).toMatchObject({
      status: 'pending',
      whiteId: 'ana',
      blackId: 'beto',
    });

    await useCases.accept(game.id, 'beto');
    const after = await useCases.move(game.id, 'ana', { from: 'e2', to: 'e4' });
    expect(after.pgn).toContain('e4');
    expect(published.map((e) => e.type)).toEqual(['GameStarted', 'MoveMade']);
  });

  it('el color aleatorio se sortea', async () => {
    const { useCases } = setup();
    const game = await useCases.challenge('club', 'ana', {
      opponentId: 'beto',
      timeControl: '3+2',
      color: 'random',
    });
    // random() = 0.9 → quien desafía juega con negras
    expect(game.blackId).toBe('ana');
  });

  it('no se desafía a alguien de afuera del club', async () => {
    const { useCases } = setup();
    expect(
      await code(
        useCases.challenge('club', 'ana', {
          opponentId: 'outsider',
          timeControl: '5+0',
          color: 'white',
        }),
      ),
    ).toBe('OPPONENT_NOT_MEMBER');
  });

  it('reintenta cuando otra request guardó primero, y se rinde tras varios choques', async () => {
    const { useCases, games } = setup();
    const game = await useCases.challenge('club', 'ana', {
      opponentId: 'beto',
      timeControl: '5+0',
      color: 'white',
    });

    games.conflictsLeft = 1;
    expect((await useCases.accept(game.id, 'beto')).status).toBe('in_progress');

    games.conflictsLeft = 5;
    expect(await code(useCases.resign(game.id, 'ana'))).toBe('CONFLICT');
  });

  it('checkTimeout no guarda nada si nadie se quedó sin tiempo', async () => {
    const { useCases, games } = setup();
    const game = await useCases.challenge('club', 'ana', {
      opponentId: 'beto',
      timeControl: '5+0',
      color: 'white',
    });
    const before = games.rows.get(game.id)?.version;
    await useCases.checkTimeout(game.id);
    expect(games.rows.get(game.id)?.version).toBe(before);
  });

  it('una partida inexistente da GAME_NOT_FOUND', async () => {
    const { useCases } = setup();
    expect(await code(useCases.get('nada'))).toBe('GAME_NOT_FOUND');
  });

  it('un desafío que nadie acepta vence al día y deja de listarse', async () => {
    const { useCases, advance } = setup();
    const game = await useCases.challenge('club', 'w', {
      opponentId: 'b',
      timeControl: '5+0',
      color: 'white',
    });
    expect(await useCases.list('club', ['pending'])).toHaveLength(1);

    advance(CHALLENGE_TTL_MS + 1);
    expect(await useCases.list('club', ['pending'])).toEqual([]);
    expect(await code(useCases.accept(game.id, 'b'))).toBe('CHALLENGE_EXPIRED');
  });

  it('no se pueden tener más de 5 desafíos abiertos a la vez', async () => {
    const { useCases, advance } = setup();
    const challenge = () =>
      useCases.challenge('club', 'w', {
        opponentId: 'b',
        timeControl: '5+0',
        color: 'white',
      });
    for (let i = 0; i < MAX_OPEN_CHALLENGES; i++) await challenge();
    expect(await code(challenge())).toBe('TOO_MANY_CHALLENGES');

    // Los vencidos ya no cuentan.
    advance(CHALLENGE_TTL_MS + 1);
    expect(await code(challenge())).toBeUndefined();
  });
});
