import { Injectable } from '@nestjs/common';
import { TenantPrisma } from '../../../infrastructure/prisma.module';
import { MembershipRepository } from '../../application/repositories/membership.repository';
import type { Permission, RoleGrant } from '../../domain/entities/role';

@Injectable()
export class PrismaMembershipRepository extends MembershipRepository {
  constructor(private readonly prisma: TenantPrisma) {
    super();
  }

  async role(clubId: string, userId: string): Promise<RoleGrant | null> {
    const member = await this.prisma.client.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: {
        role: { select: { id: true, isOwner: true, permissions: true } },
      },
    });
    return member
      ? {
          roleId: member.role.id,
          isOwner: member.role.isOwner,
          permissions: member.role.permissions as Permission[],
        }
      : null;
  }

  async clubId(slug: string, userId: string): Promise<string | null> {
    const member = await this.prisma.client.membership.findFirst({
      where: { userId, club: { slug: slug.toLowerCase() } },
      select: { clubId: true },
    });
    return member?.clubId ?? null;
  }

  async exists(clubId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.client.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { id: true },
    });
    return member !== null;
  }
}
