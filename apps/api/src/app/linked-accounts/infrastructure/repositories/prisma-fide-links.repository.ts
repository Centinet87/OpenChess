import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import type { FideLinksRepository } from '../../application/repositories/linked-accounts.ports';
import type { FideLinkSnapshot, FideRatings } from '../../domain/entities/fide';

interface FideRow {
  clubId: string;
  userId: string;
  fideId: string;
  name: string;
  federation: string | null;
  title: string | null;
  ratings: unknown;
  ratingsUpdatedAt: Date;
  linkedBy: string;
}

function toSnapshot(row: FideRow): FideLinkSnapshot {
  return {
    clubId: row.clubId,
    userId: row.userId,
    fideId: row.fideId,
    name: row.name,
    federation: row.federation,
    title: row.title,
    ratings: row.ratings as FideRatings,
    ratingsUpdatedAt: row.ratingsUpdatedAt,
    linkedBy: row.linkedBy,
  };
}

/** FIDE ID de los miembros. RLS limita todo al club del contexto. */
@Injectable()
export class PrismaFideLinksRepository implements FideLinksRepository {
  constructor(private readonly prisma: TenantPrisma) {}

  private get db() {
    return this.prisma.client;
  }

  async find(clubId: string, userId: string): Promise<FideLinkSnapshot | null> {
    const row = await this.db.fideLink.findUnique({
      where: { clubId_userId: { clubId, userId } },
    });
    return row ? toSnapshot(row) : null;
  }

  async list(clubId: string): Promise<FideLinkSnapshot[]> {
    const rows = await this.db.fideLink.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toSnapshot);
  }

  async save(link: FideLinkSnapshot): Promise<boolean> {
    const data = {
      fideId: link.fideId,
      name: link.name,
      federation: link.federation,
      title: link.title,
      ratings: { ...link.ratings },
      ratingsUpdatedAt: link.ratingsUpdatedAt,
      linkedBy: link.linkedBy,
    };
    try {
      await this.db.fideLink.upsert({
        where: { clubId_userId: { clubId: link.clubId, userId: link.userId } },
        create: { clubId: link.clubId, userId: link.userId, ...data },
        update: data,
      });
      return true;
    } catch (error) {
      // fide_links_club_id_fide_id_key: ya es de otro miembro del club.
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  async delete(clubId: string, userId: string): Promise<void> {
    await this.db.fideLink.deleteMany({ where: { clubId, userId } });
  }

  async isMember(clubId: string, userId: string): Promise<boolean> {
    const member = await this.db.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { id: true },
    });
    return !!member;
  }
}
