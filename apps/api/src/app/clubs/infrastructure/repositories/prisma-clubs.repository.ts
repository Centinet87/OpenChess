import { Inject, Injectable } from '@nestjs/common';
import { createPrismaClient, tenantTransaction } from '@openchess/database';
import { isLastOwnerError } from '../../../infrastructure/prisma-errors';
import {
  BASE_PRISMA,
  TenantPrisma,
} from '../../../infrastructure/prisma.module';
import { ClubSlugCache } from '../../../tenant/infrastructure/cache/club-slug.cache';
import {
  type ClubsRepository,
  type InvitationsRepository,
  type MemberRow,
  type MyClub,
  type RolesRepository,
} from '../../application/repositories/clubs.ports';
import { type NewClub } from '../../domain/entities/club';
import { type Invitation } from '../../domain/entities/invitation';
import { type ClubRole, type Permission } from '../../domain/entities/role';
import { type Member } from '../../domain/entities/roster';
import { ClubError, memberLimitError } from '../../domain/errors';

interface RoleRow {
  id: string;
  clubId: string;
  name: string;
  color: string | null;
  position: number;
  isOwner: boolean;
  permissions: string[];
}

function toRole(row: RoleRow): ClubRole {
  return { ...row, permissions: row.permissions as Permission[] };
}

function isMemberLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('MEMBER_LIMIT');
}

function lastOwner(error: unknown): never {
  if (isLastOwnerError(error)) {
    throw new ClubError(
      'LAST_OWNER',
      'El club tiene que tener al menos un dueño',
    );
  }
  throw error;
}

const ROLE_SUMMARY = {
  id: true,
  name: true,
  color: true,
  position: true,
  isOwner: true,
} as const;

/** Adaptador Prisma de los puertos de clubs. Los tipos de Prisma no salen de aquí. */
@Injectable()
export class PrismaClubsRepository
  implements ClubsRepository, RolesRepository, InvitationsRepository
{
  constructor(
    private readonly prisma: TenantPrisma,
    @Inject(BASE_PRISMA)
    private readonly base: ReturnType<typeof createPrismaClient>,
    private readonly slugs: ClubSlugCache,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.db.club.count({ where: { slug } })) > 0;
  }

  async createWithOwner(
    club: NewClub & { id: string },
    roles: readonly ClubRole[],
    ownerId: string,
  ): Promise<void> {
    const owner = roles.find((r) => r.isOwner);
    if (!owner) throw new Error('El club necesita un rol dueño');
    // Roles y membresía pasan por RLS: el contexto tiene que apuntar al club nuevo.
    try {
      await tenantTransaction(
        this.base,
        { clubId: club.id, userId: ownerId },
        (tx) => [
          tx.club.create({
            data: { id: club.id, slug: club.slug, name: club.name },
          }),
          tx.clubRole.createMany({ data: roles.map(toRoleData) }),
          tx.membership.create({
            data: { clubId: club.id, userId: ownerId, roleId: owner.id },
          }),
        ],
      );
    } catch (error) {
      // Dos requests con el mismo slug a la vez: gana la primera.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ClubError('SLUG_TAKEN', 'Ese subdominio ya está ocupado');
      }
      throw error;
    }
    // Si alguien visitó el subdominio antes (o era de un club borrado), que no
    // quede el "no existe" o el id viejo en la caché.
    this.slugs.evict(club.slug);
  }

  async listForUser(userId: string): Promise<MyClub[]> {
    const rows = await this.db.membership.findMany({
      where: { userId },
      select: {
        role: { select: ROLE_SUMMARY },
        club: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ ...r.club, role: r.role }));
  }

  async members(clubId: string): Promise<MemberRow[]> {
    const rows = await this.db.membership.findMany({
      where: { clubId },
      select: {
        userId: true,
        roleId: true,
        user: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      userId: r.userId,
      roleId: r.roleId,
      displayName: r.user.displayName,
    }));
  }

  findMember(clubId: string, userId: string): Promise<Member | null> {
    return this.db.membership.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { userId: true, roleId: true },
    });
  }

  async addMember(
    clubId: string,
    member: Member,
    maxMembers: number | null,
  ): Promise<void> {
    // El trigger memberships_member_limit (migración member_limit) lee el tope
    // de esta misma transacción y lo hace cumplir aunque entren dos a la vez.
    const max = maxMembers === null ? '' : String(maxMembers);
    await this.prisma
      .transaction((tx) => [
        tx.$executeRaw`SELECT set_config('app.max_members', ${max}, TRUE)`,
        tx.membership.create({ data: { clubId, ...member } }),
      ])
      .catch((error: unknown) => {
        // Dos invitaciones aceptadas a la vez por la misma persona: entra una sola vez.
        if ((error as { code?: string }).code === 'P2002') {
          throw new ClubError('ALREADY_MEMBER', 'Ya eres miembro de este club');
        }
        if (maxMembers !== null && isMemberLimitError(error)) {
          throw memberLimitError(maxMembers);
        }
        throw error;
      });
  }

  async updateRole(
    clubId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.db.membership
      .update({
        where: { clubId_userId: { clubId, userId } },
        data: { roleId },
      })
      .catch(lastOwner);
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    await this.db.membership
      .delete({ where: { clubId_userId: { clubId, userId } } })
      .catch(lastOwner);
  }

  async roles(clubId: string): Promise<ClubRole[]> {
    const rows = await this.db.clubRole.findMany({
      where: { clubId },
      orderBy: { position: 'asc' },
    });
    return rows.map(toRole);
  }

  async saveRoles(roles: readonly ClubRole[]): Promise<void> {
    if (roles.length === 0) return;
    // Todos juntos: un reorden no puede quedar a medias.
    await this.prisma.transaction((tx) =>
      roles.map((role) =>
        tx.clubRole.upsert({
          where: { id: role.id },
          create: toRoleData(role),
          update: {
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: [...role.permissions],
          },
        }),
      ),
    );
  }

  async deleteRole(clubId: string, roleId: string): Promise<void> {
    await this.db.clubRole.deleteMany({ where: { clubId, id: roleId } });
  }

  async create(input: {
    clubId: string;
    tokenHash: string;
    roleId: string;
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
        roleId: true,
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

function toRoleData(role: ClubRole) {
  return {
    id: role.id,
    clubId: role.clubId,
    name: role.name,
    color: role.color,
    position: role.position,
    isOwner: role.isOwner,
    permissions: [...role.permissions],
  };
}
