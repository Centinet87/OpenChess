import { ClubError } from '../errors';

/** Lo que un rol puede hacer en el club. El rol dueño (Admin) puede todo. */
export const PERMISSIONS = [
  'MANAGE_ROLES',
  'INVITE_MEMBERS',
  'REMOVE_MEMBERS',
  'MANAGE_FIDE',
  'PLAY_GAMES',
  'IMPORT_GAMES',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface ClubRole {
  readonly id: string;
  readonly clubId: string;
  readonly name: string;
  /** Color para mostrarlo, como #rrggbb. */
  readonly color: string | null;
  /** Orden en la jerarquía: 0 es el más alto. */
  readonly position: number;
  /** El rol dueño: todos los permisos, no se borra y el club siempre tiene alguien con él. */
  readonly isOwner: boolean;
  readonly permissions: readonly Permission[];
}

/** Lo que el guard del club deja en el contexto de la request. */
export interface RoleGrant {
  readonly roleId: string;
  readonly isOwner: boolean;
  readonly permissions: readonly Permission[];
}

export function hasPermission(
  role: Pick<ClubRole, 'isOwner' | 'permissions'>,
  permission: Permission,
): boolean {
  return role.isOwner || role.permissions.includes(permission);
}

/** `actor` está por encima de `role` en la jerarquía. Un dueño está por encima de todos. */
export function outranks(actor: ClubRole, role: ClubRole): boolean {
  return actor.isOwner || actor.position < role.position;
}

export interface RoleInput {
  readonly name: string;
  readonly color?: string | null;
  readonly permissions: readonly string[];
}

export function parseRoleName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40) {
    throw new ClubError(
      'INVALID_ROLE',
      'El nombre del rol debe tener entre 1 y 40 caracteres',
    );
  }
  return name;
}

export function parseColor(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (!/^#[0-9a-f]{6}$/i.test(raw)) {
    throw new ClubError('INVALID_ROLE', 'El color debe ser como #1e90ff');
  }
  return raw.toLowerCase();
}

export function parsePermissions(raw: readonly string[]): Permission[] {
  const unknown = raw.filter(
    (p) => !(PERMISSIONS as readonly string[]).includes(p),
  );
  if (unknown.length) {
    throw new ClubError(
      'INVALID_ROLE',
      `Permisos desconocidos: ${unknown.join(', ')}`,
    );
  }
  // Sin repetidos y en el orden de PERMISSIONS
  return PERMISSIONS.filter((p) => raw.includes(p));
}

/** Los roles con que parte todo club. Se pueden renombrar, cambiar y borrar (menos Admin). */
export function defaultRoles(clubId: string, newId: () => string): ClubRole[] {
  return [
    {
      id: newId(),
      clubId,
      name: 'Admin',
      color: '#c0392b',
      position: 0,
      isOwner: true,
      permissions: [...PERMISSIONS],
    },
    {
      id: newId(),
      clubId,
      name: 'Profesor',
      color: '#2980b9',
      position: 1,
      isOwner: false,
      permissions: ['INVITE_MEMBERS', 'PLAY_GAMES', 'IMPORT_GAMES'],
    },
    {
      id: newId(),
      clubId,
      name: 'Alumno',
      color: '#7f8c8d',
      position: 2,
      isOwner: false,
      permissions: ['PLAY_GAMES', 'IMPORT_GAMES'],
    },
  ];
}
