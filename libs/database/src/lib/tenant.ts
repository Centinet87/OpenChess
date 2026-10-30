import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface TenantContext {
  clubId?: string;
  userId?: string;
}

/**
 * Envuelve cada consulta de modelo en una transacción que baja al rol app_user
 * y fija app.club_id / app.user_id, para que actúen las políticas RLS.
 * Sin contexto, las tablas con RLS no devuelven filas.
 *
 * shortcut: $queryRaw/$executeRaw y $transaction no fijan el contexto.
 * Para operaciones compuestas, usar $tenantTransaction.
 */
export function withTenantContext(
  base: PrismaClient,
  getContext: () => TenantContext,
) {
  return base.$extends({
    client: {
      $tenantTransaction<T>(
        operation: (tx: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        const { clubId = '', userId = '' } = getContext();
        return base.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL ROLE app_user`;
          await tx.$executeRaw`SELECT set_config('app.club_id', ${clubId}, TRUE), set_config('app.user_id', ${userId}, TRUE)`;
          return operation(tx);
        });
      },
    },
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
