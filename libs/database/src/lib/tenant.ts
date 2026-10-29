import type { PrismaClient } from '../generated/prisma/client.js';

export interface TenantContext {
  clubId?: string;
  userId?: string;
}

/**
 * Envuelve cada consulta de modelo en una transacción que baja al rol app_user
 * y fija app.club_id / app.user_id, para que actúen las políticas RLS.
 * Sin contexto, las tablas con RLS no devuelven filas.
 *
 * shortcut: $queryRaw/$executeRaw no pasan por aquí, y una consulta dentro de un
 * $transaction interactivo tampoco. Si se necesitan, fijar el contexto a mano.
 */
export function withTenantContext(
  base: PrismaClient,
  getContext: () => TenantContext,
) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const { clubId = '', userId = '' } = getContext();
          const [, , result] = await base.$transaction([
            base.$executeRaw`SET LOCAL ROLE app_user`,
            base.$executeRaw`SELECT set_config('app.club_id', ${clubId}, TRUE), set_config('app.user_id', ${userId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof withTenantContext>;
