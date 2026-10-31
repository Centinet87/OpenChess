import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import { TenantRepository } from '../../application/repositories/tenant.repository';
import { ClubSlugCache } from '../cache/club-slug.cache';

@Injectable()
export class PrismaTenantRepository extends TenantRepository {
  constructor(
    private readonly prisma: TenantPrisma,
    private readonly slugs: ClubSlugCache,
  ) {
    super();
  }

  async clubId(slug: string): Promise<string | null> {
    const cached = this.slugs.get(slug);
    if (cached !== undefined) return cached;
    const club = await this.prisma.client.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    const id = club?.id ?? null;
    this.slugs.set(slug, id);
    return id;
  }
}
