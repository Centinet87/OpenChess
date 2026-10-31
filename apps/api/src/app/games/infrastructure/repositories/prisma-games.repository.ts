import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import type {
  GamesRepository,
  MembershipChecker,
  StoredGame,
} from '../../application/repositories/games.ports';
import type { ClockState } from '../../domain/entities/clock';
import type {
  GameSnapshot,
  GameStatus,
  Result,
  Termination,
} from '../../domain/entities/game';
import type { TimeControlKind } from '../../domain/entities/time-control';

type DbStatus = 'PENDING' | 'IN_PROGRESS' | 'FINISHED';

const TO_DB: Record<GameStatus, DbStatus> = {
  pending: 'PENDING',
  in_progress: 'IN_PROGRESS',
  finished: 'FINISHED',
};
const FROM_DB: Record<DbStatus, GameStatus> = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
};

interface GameRow {
  id: string;
  clubId: string;
  whiteId: string;
  blackId: string;
  challengerId: string;
  timeKind: string;
  initialMs: number;
  incrementMs: number;
  pgn: string;
  clock: unknown;
  drawOfferBy: string | null;
  status: DbStatus;
  result: string | null;
  termination: string | null;
  version: number;
}

function toSnapshot(row: GameRow): GameSnapshot {
  return {
    id: row.id,
    clubId: row.clubId,
    whiteId: row.whiteId,
    blackId: row.blackId,
    challengerId: row.challengerId,
    timeControl: {
      kind: row.timeKind as TimeControlKind,
      initialMs: row.initialMs,
      incrementMs: row.incrementMs,
    },
    pgn: row.pgn,
    clock: row.clock as ClockState,
    drawOfferBy: row.drawOfferBy as GameSnapshot['drawOfferBy'],
    status: FROM_DB[row.status],
    result: row.result as Result | null,
    termination: row.termination as Termination | null,
  };
}

function toData(s: GameSnapshot) {
  return {
    pgn: s.pgn,
    clock: { ...s.clock },
    drawOfferBy: s.drawOfferBy,
    status: TO_DB[s.status],
    result: s.result,
    termination: s.termination,
  };
}

/** Adaptador Prisma de games. RLS limita todo al club del contexto. */
@Injectable()
export class PrismaGamesRepository
  implements GamesRepository, MembershipChecker
{
  constructor(private readonly prisma: TenantPrisma) {}

  private get db() {
    return this.prisma.client;
  }

  async insert(s: GameSnapshot): Promise<void> {
    await this.db.game.create({
      data: {
        id: s.id,
        clubId: s.clubId,
        whiteId: s.whiteId,
        blackId: s.blackId,
        challengerId: s.challengerId,
        timeKind: s.timeControl.kind,
        initialMs: s.timeControl.initialMs,
        incrementMs: s.timeControl.incrementMs,
        ...toData(s),
      },
    });
  }

  async find(gameId: string): Promise<StoredGame | null> {
    const row = await this.db.game.findUnique({ where: { id: gameId } });
    return row
      ? {
          snapshot: toSnapshot(row),
          version: row.version,
          createdAt: row.createdAt.getTime(),
        }
      : null;
  }

  async update(s: GameSnapshot, expectedVersion: number): Promise<boolean> {
    const { count } = await this.db.game.updateMany({
      where: { id: s.id, version: expectedVersion },
      data: { ...toData(s), version: { increment: 1 } },
    });
    return count === 1;
  }

  async list(
    clubId: string,
    statuses: readonly GameStatus[],
    limit: number,
    pendingSince: number,
  ): Promise<GameSnapshot[]> {
    const rows = await this.db.game.findMany({
      where: {
        clubId,
        status: { in: statuses.map((s) => TO_DB[s]) },
        // Los desafíos vencidos no se muestran.
        NOT: {
          status: 'PENDING',
          createdAt: { lt: new Date(pendingSince) },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSnapshot);
  }

  countPending(
    clubId: string,
    challengerId: string,
    since: number,
  ): Promise<number> {
    return this.db.game.count({
      where: {
        clubId,
        challengerId,
        status: 'PENDING',
        createdAt: { gte: new Date(since) },
      },
    });
  }

  /** Miembro del club cuyo rol puede jugar (permiso PLAY_GAMES). */
  async isMember(clubId: string, userId: string): Promise<boolean> {
    const count = await this.db.membership.count({
      where: {
        clubId,
        userId,
        role: {
          OR: [{ isOwner: true }, { permissions: { has: 'PLAY_GAMES' } }],
        },
      },
    });
    return count === 1;
  }
}
