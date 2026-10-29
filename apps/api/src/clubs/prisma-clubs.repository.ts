import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ClubError,
  type ClubsRepository,
  type Invitation,
  type InvitationsRepository,
  type Member,
  type MemberRole,
  type MemberView,
  type MyClub,
  type NewClub,
} from '@openchess/clubs';
import { createPrismaClient, withTenantContext } from '@openchess/database';
import { BASE_PRISMA, TenantPrisma } from '../infrastructure/prisma.module';

/** Adaptador Prisma de los puertos de libs/clubs. Los tipos de Prisma no salen de aquí. */
@Injectable()
export class PrismaClubsRepository
  implements ClubsRepository, InvitationsRepository
{
  constructor(
    private readonly prisma: TenantPrisma,
    @Inject(BASE_PRISMA)
    private readonly base: ReturnType<typeof createPrismaClient>,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.db.club.count({ where: { slug } })) > 0;
  }

  async createWithOwner(
    club: NewClub,
    ownerId: string,
  ): Promise<{ id: string }> {
    // La membresía del OWNER pasa por RLS: el contexto tiene que apuntar al club nuevo.
    const id = randomUUID();
    const scoped = withTenantContext(this.base, () => ({
      clubId: id,
      userId: ownerId,
    }));
    try {
      await scoped.club.create({
        data: {
          id,
          slug: club.slug,
          name: club.name,
          memberships: { create: { userId: ownerId, role: 'OWNER' } },
        },
      });
    } catch (error) {
      // Dos requests con el mismo slug a la vez: gana la primera.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ClubError('SLUG_TAKEN', 'Ese subdominio ya está ocupado');
      }
      throw error;
    }
    return { id };
  }

  async listForUser(userId: string): Promise<MyClub[]> {
    const rows = await this.db.membership.findMany({
      where: { userId },
      select: {
        role: true,
        club: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ ...r.club, role: r.role }));
  }

  async members(clubId: string): Promise<MemberView[]> {
    const rows = await this.db.membership.findMany({
      where: { clubId },
      select: {
        userId: true,
        role: true,
        user: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      role: r.role,
      displayName: r.user.displayName,
    }));
  }

  findMember(clubId: string, userId: string): Promise<Member | null> {
    return this.db.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { userId: true, role: true },
    });
  }

  async addMember(clubId: string, member: Member): Promise<void> {
    await this.db.membership.create({ data: { clubId, ...member } });
  }

  async updateRole(
    clubId: string,
    userId: string,
    role: MemberRole,
  ): Promise<void> {
    await this.db.membership.update({
      where: { clubId_userId: { clubId, userId } },
      data: { role },
    });
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    await this.db.membership.delete({
      where: { clubId_userId: { clubId, userId } },
    });
  }

  async create(input: {
    clubId: string;
    tokenHash: string;
    role: MemberRole;
    createdById: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.invitation.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return this.db.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        clubId: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
  }

  async markAccepted(id: string, at: Date): Promise<boolean> {
    const { count } = await this.db.invitation.updateMany({
      where: { id, acceptedAt: null },
      data: { acceptedAt: at },
    });
    return count === 1;
  }
}
