import { newClub } from '../../domain/entities/club';
import {
  assertAcceptable,
  invitationExpiry,
} from '../../domain/entities/invitation';
import {
  defaultRoles,
  type ClubRole,
  type RoleInput,
} from '../../domain/entities/role';
import { RoleBook } from '../../domain/entities/role-book';
import { Roster } from '../../domain/entities/roster';
import { ClubError, memberLimitError } from '../../domain/errors';
import type {
  ClubsDeps,
  MemberView,
  MyClub,
  RoleSummary,
} from '../repositories/clubs.ports';

function summary(role: ClubRole): RoleSummary {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    isOwner: role.isOwner,
  };
}

export class ClubsUseCases {
  constructor(private readonly deps: ClubsDeps) {}

  /** Quien crea el club queda con el rol dueño. El club parte con Admin, Profesor y Alumno. */
  async createClub(
    userId: string,
    input: { slug: string; name: string },
  ): Promise<{ id: string; slug: string }> {
    const club = newClub(input);
    if (await this.deps.clubs.slugExists(club.slug)) {
      throw new ClubError('SLUG_TAKEN', 'Ese subdominio ya está ocupado');
    }
    const id = this.deps.newId();
    await this.deps.clubs.createWithOwner(
      { id, ...club },
      defaultRoles(id, this.deps.newId),
      userId,
    );
    return { id, slug: club.slug };
  }

  listMyClubs(userId: string): Promise<MyClub[]> {
    return this.deps.clubs.listForUser(userId);
  }

  /** Miembros ordenados por la jerarquía de su rol y luego por nombre. */
  async listMembers(clubId: string): Promise<MemberView[]> {
    const [rows, roles] = await Promise.all([
      this.deps.clubs.members(clubId),
      this.book(clubId),
    ]);
    return rows
      .map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        role: summary(roles.require(m.roleId)),
      }))
      .sort(
        (a, b) =>
          a.role.position - b.role.position ||
          a.displayName.localeCompare(b.displayName),
      );
  }

  async listRoles(clubId: string): Promise<readonly ClubRole[]> {
    return (await this.book(clubId)).all;
  }

  /** Mi rol en el club, con sus permisos: el front lo usa para saber qué mostrar. */
  async myRole(clubId: string, userId: string): Promise<ClubRole> {
    return (await this.roster(clubId)).roleOf(userId);
  }

  async createRole(
    clubId: string,
    actorId: string,
    input: RoleInput,
  ): Promise<ClubRole> {
    const roster = await this.roster(clubId);
    const actor = roster.requirePermission(actorId, 'MANAGE_ROLES');
    const { role } = roster.roles.create(actor, input, this.deps.newId());
    await this.deps.roles.saveRoles([role]);
    return role;
  }

  async updateRole(
    clubId: string,
    actorId: string,
    roleId: string,
    input: Partial<RoleInput>,
  ): Promise<ClubRole> {
    const roster = await this.roster(clubId);
    const actor = roster.requirePermission(actorId, 'MANAGE_ROLES');
    const { role } = roster.roles.update(actor, roleId, input);
    await this.deps.roles.saveRoles([role]);
    return role;
  }

  async deleteRole(
    clubId: string,
    actorId: string,
    roleId: string,
  ): Promise<void> {
    const roster = await this.roster(clubId);
    const actor = roster.requirePermission(actorId, 'MANAGE_ROLES');
    const book = roster.roles.remove(actor, roleId, roster.isRoleInUse(roleId));
    await this.deps.roles.deleteRole(clubId, roleId);
    // Las posiciones quedan sin huecos.
    await this.deps.roles.saveRoles(book.all);
  }

  async reorderRoles(
    clubId: string,
    actorId: string,
    roleIds: readonly string[],
  ): Promise<readonly ClubRole[]> {
    const roster = await this.roster(clubId);
    const actor = roster.requirePermission(actorId, 'MANAGE_ROLES');
    const book = roster.roles.reorder(actor, roleIds);
    await this.deps.roles.saveRoles(book.all);
    return book.all;
  }

  async invite(
    clubId: string,
    inviterId: string,
    roleId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const roster = await this.roster(clubId);
    roster.assertCanInvite(inviterId, roleId);
    await this.assertRoomFor(clubId, roster.all.length);

    const { token, hash } = this.deps.tokens.issue();
    const expiresAt = invitationExpiry(this.deps.clock.now());
    await this.deps.invitations.create({
      clubId,
      tokenHash: hash,
      roleId,
      createdById: inviterId,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async acceptInvitation(
    clubId: string,
    userId: string,
    token: string,
  ): Promise<{ role: RoleSummary }> {
    const invitation = await this.deps.invitations.findByTokenHash(
      this.deps.tokens.hash(token),
    );
    // El repositorio ve solo las del club actual; el chequeo extra no cuesta nada.
    if (!invitation || invitation.clubId !== clubId) {
      throw new ClubError('INVITATION_NOT_FOUND', 'Invitación no encontrada');
    }
    const now = this.deps.clock.now();
    const existing = await this.deps.clubs.findMember(clubId, userId);
    assertAcceptable(invitation, now, existing !== null);

    const max = await this.assertRoomFor(
      clubId,
      (await this.deps.clubs.members(clubId)).length,
    );
    if (!(await this.deps.invitations.markAccepted(invitation.id, now))) {
      throw new ClubError('INVITATION_USED', 'Esta invitación ya se usó');
    }
    await this.deps.clubs.addMember(
      clubId,
      { userId, roleId: invitation.roleId },
      max,
    );
    const role = (await this.book(clubId)).require(invitation.roleId);
    return { role: summary(role) };
  }

  async changeMemberRole(
    clubId: string,
    actorId: string,
    targetId: string,
    roleId: string,
  ): Promise<void> {
    const roster = await this.roster(clubId);
    roster.changeRole(actorId, targetId, roleId);
    await this.deps.clubs.updateRole(clubId, targetId, roleId);
  }

  async removeMember(
    clubId: string,
    actorId: string,
    targetId: string,
  ): Promise<void> {
    const roster = await this.roster(clubId);
    roster.remove(actorId, targetId);
    await this.deps.clubs.removeMember(clubId, targetId);
  }

  /**
   * El plan gratis tiene tope: si está lleno no se invita ni entra nadie más.
   * Devuelve el tope (null: sin tope).
   */
  private async assertRoomFor(
    clubId: string,
    members: number,
  ): Promise<number | null> {
    const max = (await this.deps.limits?.maxMembers(clubId)) ?? null;
    if (max !== null && members >= max) {
      throw memberLimitError(max);
    }
    return max;
  }

  private async book(clubId: string): Promise<RoleBook> {
    return RoleBook.of(await this.deps.roles.roles(clubId));
  }

  private async roster(clubId: string): Promise<Roster> {
    const [members, roles] = await Promise.all([
      this.deps.clubs.members(clubId),
      this.book(clubId),
    ]);
    return Roster.of(members, roles);
  }
}
