import { Injectable } from '@nestjs/common';
import type {
  GameResult,
  ImportedGameSnapshot,
  ImportedGamesRepository,
  LinkedAccountSnapshot,
  LinkedAccountsRepository,
  OnlineRatings,
  Platform,
} from '@openchess/linked-accounts';
import { TenantPrisma } from '../infrastructure/prisma.module';

type DbPlatform = 'LICHESS' | 'CHESSCOM';

const TO_DB: Record<Platform, DbPlatform> = {
  lichess: 'LICHESS',
  chesscom: 'CHESSCOM',
};
const FROM_DB: Record<DbPlatform, Platform> = {
  LICHESS: 'lichess',
  CHESSCOM: 'chesscom',
};

interface AccountRow {
  id: string;
  userId: string;
  platform: DbPlatform;
  username: string;
  displayName: string;
  verificationCode: string | null;
  verifiedAt: Date | null;
  ratings: unknown;
  ratingsUpdatedAt: Date | null;
}

function toAccount(row: AccountRow): LinkedAccountSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    platform: FROM_DB[row.platform],
    username: row.username,
    displayName: row.displayName,
    verificationCode: row.verificationCode,
    verifiedAt: row.verifiedAt,
    ratings: row.ratings as OnlineRatings,
    ratingsUpdatedAt: row.ratingsUpdatedAt,
  };
}

/**
 * Adaptador Prisma de las cuentas vinculadas. RLS deja ver las propias y, en un
 * club, las de sus miembros; solo se escriben las propias.
 */
@Injectable()
export class PrismaLinkedAccountsRepository implements LinkedAccountsRepository {
  constructor(private readonly prisma: TenantPrisma) {}

  private get db() {
    return this.prisma.client;
  }

  async findByUser(userId: string): Promise<LinkedAccountSnapshot[]> {
    const rows = await this.db.linkedAccount.findMany({
      where: { userId },
      orderBy: { platform: 'asc' },
    });
    return rows.map(toAccount);
  }

  async find(
    userId: string,
    platform: Platform,
  ): Promise<LinkedAccountSnapshot | null> {
    const row = await this.db.linkedAccount.findUnique({
      where: { userId_platform: { userId, platform: TO_DB[platform] } },
    });
    return row ? toAccount(row) : null;
  }

  async save(a: LinkedAccountSnapshot): Promise<boolean> {
    const data = {
      username: a.username,
      displayName: a.displayName,
      verificationCode: a.verificationCode,
      verifiedAt: a.verifiedAt,
      ratings: { ...a.ratings },
      ratingsUpdatedAt: a.ratingsUpdatedAt,
    };
    try {
      await this.db.linkedAccount.upsert({
        where: {
          userId_platform: { userId: a.userId, platform: TO_DB[a.platform] },
        },
        create: {
          id: a.id,
          userId: a.userId,
          platform: TO_DB[a.platform],
          ...data,
        },
        update: data,
      });
      return true;
    } catch (error) {
      // linked_accounts_verified_key: otra persona ya la verificó.
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async delete(userId: string, platform: Platform): Promise<void> {
    await this.db.linkedAccount.deleteMany({
      where: { userId, platform: TO_DB[platform] },
    });
  }

  async verifiedMembers(
    clubId: string,
    platform: Platform,
    usernames: readonly string[],
  ): Promise<Map<string, string>> {
    const rows = await this.db.linkedAccount.findMany({
      where: {
        platform: TO_DB[platform],
        username: { in: [...usernames] },
        verifiedAt: { not: null },
        user: { memberships: { some: { clubId } } },
      },
      select: { username: true, userId: true },
    });
    return new Map(rows.map((r) => [r.username, r.userId]));
  }
}

interface GameRow {
  id: string;
  clubId: string;
  platform: DbPlatform;
  externalId: string;
  url: string;
  whiteName: string;
  blackName: string;
  whiteUserId: string | null;
  blackUserId: string | null;
  result: string | null;
  speed: string;
  standard: boolean;
  pgn: string;
  playedAt: Date;
  importedBy: string;
}

function toGame(row: GameRow): ImportedGameSnapshot {
  return {
    id: row.id,
    clubId: row.clubId,
    platform: FROM_DB[row.platform],
    externalId: row.externalId,
    url: row.url,
    // El usuario de la plataforma no se guarda aparte: es el nombre en minúsculas.
    white: row.whiteName.toLowerCase(),
    black: row.blackName.toLowerCase(),
    whiteName: row.whiteName,
    blackName: row.blackName,
    whiteUserId: row.whiteUserId,
    blackUserId: row.blackUserId,
    result: row.result as GameResult | null,
    speed: row.speed,
    standard: row.standard,
    pgn: row.pgn,
    playedAt: row.playedAt,
    importedBy: row.importedBy,
  };
}

function toGameData(g: ImportedGameSnapshot) {
  return {
    id: g.id,
    clubId: g.clubId,
    platform: TO_DB[g.platform],
    externalId: g.externalId,
    url: g.url,
    whiteName: g.whiteName,
    blackName: g.blackName,
    whiteUserId: g.whiteUserId,
    blackUserId: g.blackUserId,
    result: g.result,
    speed: g.speed,
    standard: g.standard,
    pgn: g.pgn,
    playedAt: g.playedAt,
    importedBy: g.importedBy,
  };
}

/** Partidas importadas al club. RLS limita todo al club del contexto. */
@Injectable()
export class PrismaImportedGamesRepository implements ImportedGamesRepository {
  constructor(private readonly prisma: TenantPrisma) {}

  private get db() {
    return this.prisma.client;
  }

  async insertNew(
    games: readonly ImportedGameSnapshot[],
  ): Promise<ImportedGameSnapshot[]> {
    if (games.length === 0) return [];
    // skipDuplicates: las que el club ya tenía (índice único por plataforma e id) no vuelven.
    const rows = await this.db.importedGame.createManyAndReturn({
      data: games.map(toGameData),
      skipDuplicates: true,
    });
    const created = new Set(rows.map((r) => r.id));
    return games.filter((g) => created.has(g.id));
  }

  async list(
    clubId: string,
    userId: string | null,
    limit: number,
  ): Promise<ImportedGameSnapshot[]> {
    const rows = await this.db.importedGame.findMany({
      where: {
        clubId,
        ...(userId && {
          OR: [{ whiteUserId: userId }, { blackUserId: userId }],
        }),
      },
      orderBy: { playedAt: 'desc' },
      take: limit,
    });
    return rows.map(toGame);
  }

  async find(clubId: string, id: string): Promise<ImportedGameSnapshot | null> {
    const row = await this.db.importedGame.findFirst({
      where: { clubId, id },
    });
    return row ? toGame(row) : null;
  }
}
