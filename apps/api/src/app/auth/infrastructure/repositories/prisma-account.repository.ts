import { Inject, Injectable } from '@nestjs/common';
import {
  createPrismaClient,
  tenantTransaction,
  withTenantContext,
} from '@openchess/database';
import { isLastOwnerError } from '../../../infrastructure/prisma-errors';
import { BASE_PRISMA } from '../../../infrastructure/prisma.module';
import { ClubSlugCache } from '../../../tenant/infrastructure/cache/club-slug.cache';
import { AccountRepository } from '../../application/repositories/account.repository';
import { AccountError } from '../../domain/account.error';
import type { AccountData } from '../../domain/entities/account-data.entity';
@Injectable()
export class PrismaAccountRepository extends AccountRepository {
  constructor(
    @Inject(BASE_PRISMA)
    private readonly base: ReturnType<typeof createPrismaClient>,
    private readonly slugs: ClubSlugCache,
  ) {
    super();
  }

  async export(userId: string): Promise<AccountData | null> {
    const own = this.as({ userId });
    const user = await own.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const linked = await own.linkedAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    const memberships = await own.membership.findMany({
      where: { userId },
      select: {
        clubId: true,
        createdAt: true,
        club: { select: { slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const clubs: AccountData['clubs'] = [];
    for (const m of memberships) {
      const db = this.as({ userId, clubId: m.clubId });
      const [membership, rating, changes, fide, games, imported] =
        await Promise.all([
          db.membership.findUnique({
            where: { clubId_userId: { clubId: m.clubId, userId } },
            select: { role: { select: { name: true } } },
          }),
          db.rating.findUnique({
            where: { clubId_userId: { clubId: m.clubId, userId } },
          }),
          db.ratingChange.findMany({
            where: { clubId: m.clubId, userId },
            include: { opponent: { select: { displayName: true } } },
            orderBy: { createdAt: 'asc' },
          }),
          db.fideLink.findUnique({
            where: { clubId_userId: { clubId: m.clubId, userId } },
          }),
          db.game.findMany({
            where: {
              clubId: m.clubId,
              OR: [{ whiteId: userId }, { blackId: userId }],
            },
            include: {
              white: { select: { displayName: true } },
              black: { select: { displayName: true } },
            },
            orderBy: { createdAt: 'asc' },
          }),
          db.importedGame.findMany({
            where: {
              clubId: m.clubId,
              OR: [{ whiteUserId: userId }, { blackUserId: userId }],
            },
            orderBy: { playedAt: 'asc' },
          }),
        ]);
      clubs.push({
        club: m.club,
        role: membership?.role.name ?? '',
        joinedAt: m.createdAt.toISOString(),
        rating: rating && {
          rating: rating.rating,
          deviation: rating.deviation,
          games: rating.games,
          wins: rating.wins,
          draws: rating.draws,
          losses: rating.losses,
        },
        ratingHistory: changes.map((c) => ({
          gameId: c.gameId,
          opponent: c.opponent.displayName,
          score: c.score,
          ratingBefore: c.ratingBefore,
          ratingAfter: c.ratingAfter,
          at: c.createdAt.toISOString(),
        })),
        fide: fide && {
          fideId: fide.fideId,
          name: fide.name,
          federation: fide.federation,
          title: fide.title,
          ratings: fide.ratings,
        },
        games: games.map((g) => {
          const white = g.whiteId === userId;
          return {
            id: g.id,
            color: white ? 'white' : 'black',
            opponent: (white ? g.black : g.white).displayName,
            status: g.status.toLowerCase(),
            result: g.result,
            termination: g.termination,
            timeControl: {
              kind: g.timeKind,
              initialMs: g.initialMs,
              incrementMs: g.incrementMs,
            },
            pgn: g.pgn,
            playedAt: g.createdAt.toISOString(),
          };
        }),
        importedGames: imported.map((g) => ({
          platform: g.platform.toLowerCase(),
          url: g.url,
          white: g.whiteName,
          black: g.blackName,
          result: g.result,
          speed: g.speed,
          pgn: g.pgn,
          playedAt: g.playedAt.toISOString(),
        })),
      });
    }

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      linkedAccounts: linked.map((a) => ({
        platform: a.platform.toLowerCase(),
        username: a.username,
        displayName: a.displayName,
        verifiedAt: a.verifiedAt?.toISOString() ?? null,
        ratings: a.ratings,
      })),
      clubs,
    };
  }

  /** Saca a la persona de un club con sus datos; si estaba sola, borra el club. */
  async leave(
    userId: string,
    clubId: string,
    deleteClub: boolean,
    slug: string,
  ): Promise<void> {
    try {
      const context = { userId, clubId };
      if (deleteClub) {
        // clubs no tiene RLS; el resto del club se va en cascada.
        await tenantTransaction(this.base, context, (tx) => [
          tx.club.delete({ where: { id: clubId } }),
        ]);
        this.slugs.evict(slug);
        return;
      }
      await tenantTransaction(this.base, context, (tx) => [
        // Los desafíos sin jugar no le sirven a nadie.
        tx.game.deleteMany({
          where: {
            clubId,
            status: 'PENDING',
            OR: [{ whiteId: userId }, { blackId: userId }],
          },
        }),
        tx.rating.deleteMany({ where: { clubId, userId } }),
        tx.ratingChange.deleteMany({ where: { clubId, userId } }),
        tx.fideLink.deleteMany({ where: { clubId, userId } }),
        tx.importedGame.updateMany({
          where: { clubId, whiteUserId: userId },
          data: { whiteUserId: null },
        }),
        tx.importedGame.updateMany({
          where: { clubId, blackUserId: userId },
          data: { blackUserId: null },
        }),
        tx.membership.delete({ where: { clubId_userId: { clubId, userId } } }),
      ]);
    } catch (error) {
      if (isLastOwnerError(error))
        throw new AccountError(
          'LAST_OWNER',
          'El club tiene que tener al menos un dueño',
        );
      throw error;
    }
  }

  private as(context: { userId: string; clubId?: string }) {
    return withTenantContext(this.base, () => context);
  }
  async passwordHash(userId: string): Promise<string | null> {
    const user = await this.as({ userId }).user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    return user?.passwordHash ?? null;
  }
  memberships(userId: string) {
    return this.as({ userId }).membership.findMany({
      where: { userId },
      select: {
        clubId: true,
        role: { select: { isOwner: true } },
        club: { select: { slug: true, name: true } },
      },
    });
  }
  activeGames(userId: string, clubId: string) {
    return this.as({ userId, clubId }).game.count({
      where: {
        clubId,
        status: 'IN_PROGRESS',
        OR: [{ whiteId: userId }, { blackId: userId }],
      },
    });
  }
  owners(userId: string, clubId: string) {
    return this.as({ userId, clubId }).membership.count({
      where: { clubId, role: { isOwner: true } },
    });
  }
  members(userId: string, clubId: string) {
    return this.as({ userId, clubId }).membership.count({ where: { clubId } });
  }
  payingSubscriptions(userId: string, clubId: string) {
    return this.as({ userId, clubId }).subscription.count({
      where: { clubId, status: { in: ['pending', 'active', 'paused'] } },
    });
  }
  async anonymize(
    userId: string,
    email: string,
    displayName: string,
  ): Promise<void> {
    await tenantTransaction(this.base, { userId }, (tx) => [
      tx.linkedAccount.deleteMany({ where: { userId } }),
      tx.refreshToken.deleteMany({ where: { userId } }),
      tx.emailToken.deleteMany({ where: { userId } }),
      tx.user.update({
        where: { id: userId },
        data: { email, passwordHash: '!', displayName, emailVerifiedAt: null },
      }),
    ]);
  }
}
