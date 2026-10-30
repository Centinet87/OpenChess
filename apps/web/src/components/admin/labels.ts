import type { Permission, RoleView } from '../../lib/api';

export const PERMISSION_LABEL: Record<Permission, string> = {
  MANAGE_ROLES: 'Gestionar roles',
  INVITE_MEMBERS: 'Invitar miembros',
  REMOVE_MEMBERS: 'Sacar miembros',
  MANAGE_FIDE: 'Gestionar Elo FIDE',
  PLAY_GAMES: 'Jugar partidas',
  IMPORT_GAMES: 'Importar partidas',
};

/** Permisos que dan acceso al panel de administración. Jugar o importar partidas no cuentan. */
const ADMIN_PERMISSIONS: Permission[] = [
  'MANAGE_ROLES',
  'INVITE_MEMBERS',
  'REMOVE_MEMBERS',
  'MANAGE_FIDE',
];

export function canAdminister(role: RoleView): boolean {
  return (
    role.isOwner || role.permissions.some((p) => ADMIN_PERMISSIONS.includes(p))
  );
}
