import { Injectable } from '@nestjs/common';
import { referenceRating, type FideRatings } from '@openchess/linked-accounts';
import type { RatingSeeds } from '@openchess/ratings';
import { TenantPrisma } from '../infrastructure/prisma.module';

/**
 * Rating inicial en el club a partir del Elo FIDE que asignó un admin. Solo se
 * usa la primera vez: después manda lo que el jugador hace en el club.
 */
@Injectable()
export class PrismaFideSeeds implements RatingSeeds {
  constructor(private readonly prisma: TenantPrisma) {}

  async find(
    clubId: string,
    userIds: readonly string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.client.fideLink.findMany({
      where: { clubId, userId: { in: [...userIds] } },
      select: { userId: true, ratings: true },
    });
    const seeds = new Map<string, number>();
    for (const row of rows) {
      const rating = referenceRating(row.ratings as FideRatings);
      if (rating !== null) seeds.set(row.userId, rating);
    }
    return seeds;
  }
}
