import { randomUUID } from 'node:crypto';
import type { AccountOperations } from '../../application/repositories/account.operations';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AccountError,
  AccountExport,
  ClubRef,
} from '@openchess/contracts';
import {
  createPrismaClient,
  tenantTransaction,
  withTenantContext,
} from '@openchess/database';
import { isLastOwnerError } from '../../../../clubs/prisma-clubs.repository';
import { BASE_PRISMA } from '../../../infrastructure/prisma.module';
import { ClubSlugCache } from '../../../tenant/club-slug.cache';
import { verifyPassword } from '../security/crypto';

type Base = ReturnType<typeof createPrismaClient>;

/** Nombre que queda en las partidas y el historial de los rivales. */
export const DELETED_NAME = 'Cuenta eliminada';

const LAST_OWNER_MESSAGE =
  'Eres el único dueño de algunos clubes: nombra a otro dueño antes de eliminar la cuenta';

function conflict(body: AccountError): ConflictException {
  return new ConflictException({ statusCode: 409, ...body });
}

/** Suscripciones que todavía cobran o pueden cobrar. */
const LIVE_SUBSCRIPTION = ['pending', 'active', 'paused'];

/**
 * Eliminar la cuenta y descargar los datos propios. Recorre los clubes de la
 * persona con el contexto de RLS de cada uno: ninguna consulta ve otro club.
 */
@Injectable()
export class AccountService implements AccountOperations {
  constructor(
    @Inject(BASE_PRISMA) private readonly base: Base,
    private readonly slugs: ClubSlugCache,
  ) {}

  async export(userId: string): Promise<AccountExport> {
    const own = this.as({ userId });
    const user = await own.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
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

    const clubs: AccountExport['clubs'] = [];
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

  /**
   * Borra los datos personales y deja la fila del usuario anónima: así las
   * partidas y el historial de los rivales siguen cuadrando, con el nombre
   * "Cuenta eliminada". Pide la contraseña para que una sesión robada no baste.
   */
  async delete(userId: string, password: string): Promise<void> {
    const own = this.as({ userId });
    const user = await own.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    const memberships = await own.membership.findMany({
      where: { userId },
      select: {
        clubId: true,
        role: { select: { isOwner: true } },
        club: { select: { slug: true, name: true } },
      },
    });

    // Primero se revisa todo y después se borra: si un club lo impide, no se toca nada.
    const clubsToDelete: string[] = [];
    const ownerless: ClubRef[] = [];
    const paying: ClubRef[] = [];
    for (const m of memberships) {
      const db = this.as({ userId, clubId: m.clubId });
      const playing = await db.game.count({
        where: {
          clubId: m.clubId,
          status: 'IN_PROGRESS',
          OR: [{ whiteId: userId }, { blackId: userId }],
        },
      });
      if (playing > 0) {
        throw conflict({
          code: 'GAME_IN_PROGRESS',
          message: 'Termina tus partidas en curso antes de eliminar la cuenta',
        });
      }
      if (!m.role.isOwner) continue;

      const [owners, members] = await Promise.all([
        db.membership.count({
          where: { clubId: m.clubId, role: { isOwner: true } },
        }),
        db.membership.count({ where: { clubId: m.clubId } }),
      ]);
      if (owners > 1) continue;
      if (members > 1) {
        ownerless.push(m.club);
        continue;
      }
      // Es el único miembro: el club se borra con la cuenta, salvo que tenga un plan que cobra.
      const subscription = await db.subscription.count({
        where: { clubId: m.clubId, status: { in: LIVE_SUBSCRIPTION } },
      });
      if (subscription > 0) paying.push(m.club);
      else clubsToDelete.push(m.clubId);
    }
    if (ownerless.length > 0) {
      throw conflict({
        code: 'LAST_OWNER',
        message: LAST_OWNER_MESSAGE,
        clubs: ownerless,
      });
    }
    if (paying.length > 0) {
      throw conflict({
        code: 'SUBSCRIPTION_ACTIVE',
        message:
          'Cancela el plan Pro de tus clubes antes de eliminar la cuenta',
        clubs: paying,
      });
    }

    for (const m of memberships) {
      const deleteClub = clubsToDelete.includes(m.clubId);
      await this.leave(userId, m.clubId, deleteClub).catch((error: unknown) => {
        // Otro dueño se fue al mismo tiempo (ver memberships_keep_owner).
        if (!isLastOwnerError(error)) throw error;
        throw conflict({
          code: 'LAST_OWNER',
          message: LAST_OWNER_MESSAGE,
          clubs: [m.club],
        });
      });
      // Si el subdominio se vuelve a usar, que no apunte al club borrado.
      if (deleteClub) this.slugs.evict(m.club.slug);
    }

    await tenantTransaction(this.base, { userId }, (tx) => [
      tx.linkedAccount.deleteMany({ where: { userId } }),
      tx.refreshToken.deleteMany({ where: { userId } }),
      tx.emailToken.deleteMany({ where: { userId } }),
      tx.user.update({
        where: { id: userId },
        data: {
          // .invalid es un dominio reservado: nunca recibe correo.
          email: `eliminada-${randomUUID()}@openchess.invalid`,
          // No es un hash PHC: ninguna contraseña lo verifica.
          passwordHash: '!',
          displayName: DELETED_NAME,
          emailVerifiedAt: null,
        },
      }),
    ]);
  }

  /** Saca a la persona de un club con sus datos; si estaba sola, borra el club. */
  private async leave(
    userId: string,
    clubId: string,
    deleteClub: boolean,
  ): Promise<void> {
    const context = { userId, clubId };
    if (deleteClub) {
      // clubs no tiene RLS; el resto del club se va en cascada.
      await tenantTransaction(this.base, context, (tx) => [
        tx.club.delete({ where: { id: clubId } }),
      ]);
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
  }

  private as(context: { userId: string; clubId?: string }) {
    return withTenantContext(this.base, () => context);
  }
}
