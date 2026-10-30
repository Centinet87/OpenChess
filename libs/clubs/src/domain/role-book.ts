import { ClubError } from './errors.js';
import {
  outranks,
  parseColor,
  parsePermissions,
  parseRoleName,
  PERMISSIONS,
  type ClubRole,
  type Permission,
  type RoleInput,
} from './role.js';

/**
 * Los roles de un club y las reglas para cambiarlos. Inmutable: cada cambio
 * devuelve un libro nuevo.
 *
 * Reglas, como en Discord: solo se tocan los roles que están por debajo del
 * propio, y no se da un permiso que uno no tiene. Así nadie se sube solo.
 */
export class RoleBook {
  private constructor(private readonly roles: readonly ClubRole[]) {}

  static of(roles: readonly ClubRole[]): RoleBook {
    return new RoleBook([...roles].sort((a, b) => a.position - b.position));
  }

  get all(): readonly ClubRole[] {
    return this.roles;
  }

  find(roleId: string): ClubRole | undefined {
    return this.roles.find((r) => r.id === roleId);
  }

  require(roleId: string): ClubRole {
    const role = this.find(roleId);
    if (!role) throw new ClubError('ROLE_NOT_FOUND', 'Ese rol no existe');
    return role;
  }

  /** Un rol nuevo queda al final de la jerarquía. */
  create(
    actor: ClubRole,
    input: RoleInput,
    id: string,
  ): { book: RoleBook; role: ClubRole } {
    const name = this.uniqueName(parseRoleName(input.name));
    const permissions = this.grantable(
      actor,
      parsePermissions(input.permissions),
    );
    const role: ClubRole = {
      id,
      clubId: actor.clubId,
      name,
      color: parseColor(input.color),
      position: this.roles.length,
      isOwner: false,
      permissions,
    };
    return { book: new RoleBook([...this.roles, role]), role };
  }

  update(
    actor: ClubRole,
    roleId: string,
    input: Partial<RoleInput>,
  ): { book: RoleBook; role: ClubRole } {
    const target = this.require(roleId);
    this.assertOutranks(actor, target);
    if (target.isOwner && input.permissions) {
      throw new ClubError(
        'INVALID_ROLE',
        'El rol dueño tiene siempre todos los permisos',
      );
    }
    const role: ClubRole = {
      ...target,
      name:
        input.name === undefined
          ? target.name
          : this.uniqueName(parseRoleName(input.name), target.id),
      color: input.color === undefined ? target.color : parseColor(input.color),
      permissions: input.permissions
        ? this.grantable(actor, parsePermissions(input.permissions))
        : target.permissions,
    };
    return {
      book: new RoleBook(this.roles.map((r) => (r.id === roleId ? role : r))),
      role,
    };
  }

  /** No se borra el rol dueño ni un rol que alguien tiene. */
  remove(actor: ClubRole, roleId: string, inUse: boolean): RoleBook {
    const target = this.require(roleId);
    this.assertOutranks(actor, target);
    if (target.isOwner) {
      throw new ClubError('INVALID_ROLE', 'El rol dueño no se puede borrar');
    }
    if (inUse) {
      throw new ClubError(
        'ROLE_IN_USE',
        'Hay miembros con ese rol: cámbialos de rol antes de borrarlo',
      );
    }
    return RoleBook.of(this.roles.filter((r) => r.id !== roleId)).renumber();
  }

  /**
   * Nuevo orden de la jerarquía. Solo lo cambia un dueño, y el rol dueño queda
   * siempre arriba.
   */
  reorder(actor: ClubRole, roleIds: readonly string[]): RoleBook {
    if (!actor.isOwner) {
      throw new ClubError(
        'FORBIDDEN',
        'Solo un dueño del club puede reordenar los roles',
      );
    }
    const others = this.roles.filter((r) => !r.isOwner);
    const sameSet =
      roleIds.length === others.length &&
      new Set(roleIds).size === roleIds.length &&
      others.every((r) => roleIds.includes(r.id));
    if (!sameSet) {
      throw new ClubError(
        'INVALID_ROLE',
        'El orden tiene que incluir cada rol una vez (menos el dueño)',
      );
    }
    const owners = this.roles.filter((r) => r.isOwner);
    const ordered = [...owners, ...roleIds.map((id) => this.require(id))];
    return new RoleBook(ordered.map((r, position) => ({ ...r, position })));
  }

  private renumber(): RoleBook {
    return new RoleBook(this.roles.map((r, position) => ({ ...r, position })));
  }

  private uniqueName(name: string, exceptId?: string): string {
    const taken = this.roles.some(
      (r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      throw new ClubError('INVALID_ROLE', `Ya existe un rol llamado ${name}`);
    }
    return name;
  }

  /** Nadie da un permiso que no tiene. */
  private grantable(actor: ClubRole, wanted: Permission[]): Permission[] {
    if (actor.isOwner) return wanted;
    const missing = wanted.filter((p) => !actor.permissions.includes(p));
    if (missing.length) {
      throw new ClubError(
        'FORBIDDEN',
        `No puedes dar permisos que no tienes: ${missing.join(', ')}`,
      );
    }
    return PERMISSIONS.filter((p) => wanted.includes(p));
  }

  private assertOutranks(actor: ClubRole, target: ClubRole): void {
    if (!outranks(actor, target)) {
      throw new ClubError(
        'FORBIDDEN',
        'Solo puedes cambiar roles que están por debajo del tuyo',
      );
    }
  }
}
