import type { PlayerRatingSnapshot } from '../../domain/entities/player-rating';
import { Glicko2System } from '../../domain/services/rating-system';
import type {
  RatedGame,
  RatingChange,
  RatingsRepository,
  Standing,
} from '../repositories/ratings.ports';
import { RatingsUseCases, type FinishedGame } from './ratings.use-cases';

/** Repositorio en memoria que se comporta como el de Prisma (idempotente por partida). */
class MemoryRatings implements RatingsRepository {
  readonly rows = new Map<string, PlayerRatingSnapshot>();
  readonly rated = new Set<string>();
  readonly changes: (RatingChange & { userId: string })[] = [];

  async find(clubId: string, userIds: readonly string[]) {
    return userIds
      .map((id) => this.rows.get(`${clubId}:${id}`))
      .filter((r): r is PlayerRatingSnapshot => !!r);
  }

  async save(game: RatedGame): Promise<boolean> {
    if (this.rated.has(game.gameId)) return false;
    this.rated.add(game.gameId);
    for (const [p, opponent] of [
      [game.white, game.black],
      [game.black, game.white],
    ] as const) {
      this.rows.set(`${game.clubId}:${p.after.userId}`, p.after);
      this.changes.unshift({
        userId: p.after.userId,
        gameId: game.gameId,
        opponentId: opponent.after.userId,
        score: p.score,
        ratingBefore: p.before.rating.rating,
        ratingAfter: p.after.rating.rating,
        playedAt: new Date(0),
      });
    }
    return true;
  }

  async standings(clubId: string): Promise<Standing[]> {
    return [...this.rows.values()]
      .filter((r) => r.clubId === clubId)
      .sort((a, b) => b.rating.rating - a.rating.rating)
      .map((r) => ({ ...r, displayName: r.userId }));
  }

  async isMember(_clubId: string, userId: string) {
    return userId !== 'nadie';
  }

  async history(_clubId: string, userId: string) {
    return this.changes.filter((c) => c.userId === userId);
  }
}

const finished = (
  gameId: string,
  result: FinishedGame['result'],
): FinishedGame => ({
  gameId,
  clubId: 'club',
  whiteId: 'ana',
  blackId: 'beto',
  result,
});

describe('RatingsUseCases', () => {
  let repo: MemoryRatings;
  let ratings: RatingsUseCases;

  beforeEach(() => {
    repo = new MemoryRatings();
    ratings = new RatingsUseCases(repo, new Glicko2System());
  });

  it('cuenta la partida para los dos y lleva victorias, tablas y derrotas', async () => {
    await ratings.recordGame(finished('g1', '1-0'));
    await ratings.recordGame(finished('g2', '1/2-1/2'));

    const [first, second] = await ratings.standings('club');
    expect(first).toMatchObject({ userId: 'ana', games: 2, wins: 1, draws: 1 });
    expect(second).toMatchObject({
      userId: 'beto',
      games: 2,
      losses: 1,
      draws: 1,
    });
    expect(first.rating.rating).toBeGreaterThan(second.rating.rating);
  });

  it('una partida abortada no cuenta', async () => {
    expect(await ratings.recordGame(finished('g1', null))).toBeNull();
    expect(await ratings.standings('club')).toEqual([]);
  });

  it('si el evento llega dos veces, la partida se cuenta una sola vez', async () => {
    await ratings.recordGame(finished('g1', '1-0'));
    expect(await ratings.recordGame(finished('g1', '1-0'))).toBeNull();
    const [ana] = await ratings.standings('club');
    expect(ana.games).toBe(1);
  });

  it('el perfil de quien no ha jugado parte en 1500, y después trae su historial', async () => {
    const before = await ratings.profile('club', 'ana');
    if (!before) throw new Error('ana es miembro');
    expect(before.rating).toMatchObject({ games: 0, rating: { rating: 1500 } });
    expect(before.history).toEqual([]);

    await ratings.recordGame(finished('g1', '0-1'));
    const after = await ratings.profile('club', 'ana');
    if (!after) throw new Error('ana es miembro');
    expect(after.history).toEqual([
      expect.objectContaining({
        gameId: 'g1',
        opponentId: 'beto',
        score: 0,
        ratingBefore: 1500,
      }),
    ]);
    expect(after.rating.rating.rating).toBeLessThan(1500);
  });

  it('no hay perfil de quien no es miembro del club', async () => {
    expect(await ratings.profile('club', 'nadie')).toBeNull();
  });

  it('quien tiene Elo FIDE y no ha jugado en el club parte con ese rating', async () => {
    const seeded = new RatingsUseCases(repo, new Glicko2System(), {
      find: async (_clubId, userIds) =>
        new Map(userIds.filter((id) => id === 'ana').map((id) => [id, 2100])),
    });
    const before = await seeded.profile('club', 'ana');
    expect(before?.rating.rating).toMatchObject({
      rating: 2100,
      deviation: 150,
    });

    // Ana (2100) le gana a Beto (1500 sin Elo): sube poco, porque se esperaba.
    await seeded.recordGame(finished('g1', '1-0'));
    const [ana] = await seeded.standings('club');
    expect(ana.rating.rating).toBeGreaterThan(2100);
    expect(ana.rating.rating).toBeLessThan(2110);

    // Ya jugó: el Elo FIDE no vuelve a usarse.
    const after = await seeded.profile('club', 'ana');
    expect(after?.rating.games).toBe(1);
  });
});
