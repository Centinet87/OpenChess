import type { RoleSummary } from '../lib/api';

/** Etiqueta del rol con el color que le dio el club. */
export function RoleTag({ role }: { role: RoleSummary }) {
  const style = role.color
    ? { borderColor: role.color, color: role.color }
    : undefined;
  return (
    <span className={`tag${role.isOwner ? ' tag-owner' : ''}`} style={style}>
      {role.name}
    </span>
  );
}
