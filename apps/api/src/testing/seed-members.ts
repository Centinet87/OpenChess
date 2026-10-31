import type { createPrismaClient } from '@openchess/database';
import { randomUUID } from 'node:crypto';
import { defaultRoles } from '../app/clubs/domain/entities/role';

type Base = ReturnType<typeof createPrismaClient>;
export type DefaultRole = 'Admin' | 'Profesor' | 'Alumno';

/**
 * Para los tests que preparan datos con el cliente base: crea los roles
 * iniciales de cada club (si faltan) y las membresías con el rol pedido.
 */
export async function seedMembers(
  base: Base,
  rows: readonly { clubId: string; userId: string; role: DefaultRole }[],
): Promise<void> {
  const roleIds = new Map<string, string>();
  for (const clubId of new Set(rows.map((r) => r.clubId))) {
    let existing = await base.clubRole.findMany({ where: { clubId } });
    if (existing.length === 0) {
      const roles = defaultRoles(clubId, randomUUID);
      await base.clubRole.createMany({
        data: roles.map((r) => ({ ...r, permissions: [...r.permissions] })),
      });
      existing = await base.clubRole.findMany({ where: { clubId } });
    }
    for (const r of existing) roleIds.set(`${clubId}:${r.name}`, r.id);
  }
  await base.membership.createMany({
    data: rows.map((r) => ({
      clubId: r.clubId,
      userId: r.userId,
      roleId: roleIds.get(`${r.clubId}:${r.role}`) as string,
    })),
  });
}
