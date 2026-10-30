import { Injectable } from '@nestjs/common';
import type {
  PlayerRatingSnapshot,
  RatedGame,
  RatedPlayer,
  RatingChange,
  RatingsRepository,
  Score,
  Standing,
} from '@openchess/ratings';
import { TenantPrisma } from '../app/infrastructure/prisma.module';

interface RatingRow {
  clubId: string;
  userId: string;
  rating: number;
  deviation: number;
  volatility: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

function toSnapshot(row: RatingRow): PlayerRatingSnapshot {
  return {
    clubId: row.clubId,
    userId: row.userId,
    rating: {
      rating: row.rating,
      deviation: row.deviation,
      volatility: row.volatility,
    },
    games: row.games,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
  };
}

function toData(s: PlayerRatingSnapshot) {
  return {
    rating: s.rating.rating,
    deviation: s.rating.deviation,
    volatility: s.rating.volatility,
    games: s.games,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
  };
}

/** Adaptador Prisma de libs/ratings. RLS limita todo al club del contexto. */
@Injectable()
export class PrismaRatingsRepository implements RatingsRepository {
  constructor(private readonly prisma: TenantPrisma) {}

  private get db() {
    return this.prisma.client;
  }

  async find(
    clubId: string,
    userIds: readonly string[],
  ): Promise<PlayerRatingSnapshot[]> {
    const rows = await this.db.rating.findMany({
      where: { clubId, userId: { in: [...userIds] } },
    });
    return rows.map(toSnapshot);
  }

  async save(game: RatedGame): Promise<boolean> {
    const change = (p: RatedPlayer, opponent: RatedPlayer) => ({
      clubId: game.clubId,
      gameId: game.gameId,
      userId: p.after.userId,
      opponentId: opponent.after.userId,
      score: p.score,
      ratingBefore: p.before.rating.rating,
      ratingAfter: p.after.rating.rating,
    });
    try {
      // El historial va primero: si la partida ya estaba contada, su índice
      // único aborta la transacción antes de tocar los ratings.
      await this.prisma.transaction((tx) => [
        tx.ratingChange.createMany({
          data: [
            change(game.white, game.black),
            change(game.black, game.white),
          ],
        }),
        ...[game.white.after, game.black.after].map((s) =>
          tx.rating.upsert({
            where: { clubId_userId: { clubId: s.clubId, userId: s.userId } },
            create: { clubId: s.clubId, userId: s.userId, ...toData(s) },
            update: toData(s),
          }),
        ),
      ]);
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async standings(clubId: string, limit: number): Promise<Standing[]> {
    const rows = await this.db.rating.findMany({
      // Solo miembros actuales: quien dejó el club sale de la tabla.
      where: { clubId, user: { memberships: { some: { clubId } } } },
      orderBy: [{ rating: 'desc' }, { games: 'desc' }],
      take: limit,
      include: { user: { select: { displayName: true } } },
    });
    return rows.map((row) => ({
      ...toSnapshot(row),
      displayName: row.user.displayName,
    }));
  }

  async isMember(clubId: string, userId: string): Promise<boolean> {
    const member = await this.db.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { id: true },
    });
    return !!member;
  }

  async history(
    clubId: string,
    userId: string,
    limit: number,
  ): Promise<RatingChange[]> {
    const rows = await this.db.ratingChange.findMany({
      where: { clubId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      gameId: row.gameId,
      opponentId: row.opponentId,
      score: row.score as Score,
      ratingBefore: row.ratingBefore,
      ratingAfter: row.ratingAfter,
      playedAt: row.createdAt,
    }));
  }
}
