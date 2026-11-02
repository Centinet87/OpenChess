import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import {
  referenceRating,
  type FideRatings,
} from '../../../linked-accounts/domain/entities/fide';
import type { RatingSeeds } from '../../application/repositories/ratings.ports';

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
