import { ClubError } from '../errors';
import {
  hasPermission,
  outranks,
  type ClubRole,
  type Permission,
} from './role';
import type { RoleBook } from './role-book';

export interface Member {
  readonly userId: string;
  readonly roleId: string;
}

/**
 * Los miembros de un club y las reglas para cambiarlos, según los permisos y la
 * jerarquía de sus roles. Es inmutable: cada cambio devuelve un roster nuevo.
 */
export class Roster {
  private constructor(
    private readonly members: readonly Member[],
    readonly roles: RoleBook,
  ) {}

  static of(members: readonly Member[], roles: RoleBook): Roster {
    return new Roster([...members], roles);
  }

  get all(): readonly Member[] {
    return this.members;
  }

  find(userId: string): Member | undefined {
    return this.members.find((m) => m.userId === userId);
  }

  roleOf(userId: string): ClubRole {
    return this.roles.require(this.require(userId).roleId);
  }

  /** El rol de quien actúa, si tiene el permiso. */
  requirePermission(userId: string, permission: Permission): ClubRole {
    const member = this.find(userId);
    if (!member) {
      throw new ClubError('FORBIDDEN', 'No eres miembro de este club');
    }
    const role = this.roles.require(member.roleId);
    if (!hasPermission(role, permission)) {
      throw new ClubError(
        'FORBIDDEN',
        'Tu rol no tiene permiso para hacer esto',
      );
    }
    return role;
  }

  isRoleInUse(roleId: string): boolean {
    return this.members.some((m) => m.roleId === roleId);
  }

  /** Invitar con un rol: hace falta el permiso y que ese rol esté por debajo del propio. */
  assertCanInvite(inviterId: string, roleId: string): ClubRole {
    const actor = this.requirePermission(inviterId, 'INVITE_MEMBERS');
    const role = this.roles.require(roleId);
    if (!outranks(actor, role)) {
      throw new ClubError(
        'FORBIDDEN',
        `No puedes invitar con el rol ${role.name}: está a tu nivel o por encima`,
      );
    }
    return role;
  }

  /**
   * Cambiar el rol de alguien: hace falta MANAGE_ROLES y estar por encima del
   * rol que tiene y del que se le da. El club nunca se queda sin dueño.
   */
  changeRole(actorId: string, targetId: string, roleId: string): Roster {
    const actor = this.requirePermission(actorId, 'MANAGE_ROLES');
    const current = this.roleOf(targetId);
    const next = this.roles.require(roleId);
    if (current.id === next.id) return this;
    if (!outranks(actor, current) || !outranks(actor, next)) {
      throw new ClubError(
        'FORBIDDEN',
        'Solo puedes asignar roles que están por debajo del tuyo',
      );
    }
    if (current.isOwner && !next.isOwner) this.assertNotLastOwner();

    return new Roster(
      this.members.map((m) => (m.userId === targetId ? { ...m, roleId } : m)),
      this.roles,
    );
  }

  /**
   * Sacar a alguien: hace falta REMOVE_MEMBERS y estar por encima de su rol.
   * Cualquiera puede salirse. El último dueño no puede irse.
   */
  remove(actorId: string, targetId: string): Roster {
    const target = this.roleOf(targetId);
    if (actorId !== targetId) {
      const actor = this.requirePermission(actorId, 'REMOVE_MEMBERS');
      if (!outranks(actor, target)) {
        throw new ClubError(
          'FORBIDDEN',
          'Solo puedes sacar a miembros con un rol por debajo del tuyo',
        );
      }
    }
    if (target.isOwner) this.assertNotLastOwner();

    return new Roster(
      this.members.filter((m) => m.userId !== targetId),
      this.roles,
    );
  }

  private require(userId: string): Member {
    const member = this.find(userId);
    if (!member)
      throw new ClubError('MEMBER_NOT_FOUND', 'No es miembro del club');
    return member;
  }

  private assertNotLastOwner(): void {
    const owners = this.members.filter(
      (m) => this.roles.find(m.roleId)?.isOwner,
    );
    if (owners.length <= 1) {
      throw new ClubError(
        'LAST_OWNER',
        'El club tiene que tener al menos un dueño',
      );
    }
  }
}
