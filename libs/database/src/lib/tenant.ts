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
 * shortcut: $queryRaw/$executeRaw no pasan por aquí, y una consulta dentro de un
 * $transaction interactivo tampoco. Si se necesitan, fijar el contexto a mano.
 * No usar un $transaction interactivo con este cliente: retiene una conexión y
 * cada consulta de adentro pide otra, así que con un pool chico se bloquea.
 *
 * shortcut: cada consulta cuesta una transacción y tres viajes a la BD (rol,
 * contexto y la consulta), y Prisma no puede agruparlas. Si pesa, fijar el
 * contexto una vez por request en una transacción.
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

/**
 * Varias escrituras atómicas con el contexto de RLS: todas o ninguna. `build`
 * recibe el cliente base y arma las consultas sin esperarlas (Prisma las corre
 * en una sola transacción, después de fijar el rol y el contexto).
 */
export async function tenantTransaction(
  base: PrismaClient,
  context: TenantContext,
  build: (db: PrismaClient) => Prisma.PrismaPromise<unknown>[],
): Promise<unknown[]> {
  const { clubId = '', userId = '' } = context;
  const results = await base.$transaction([
    base.$executeRaw`SET LOCAL ROLE app_user`,
    base.$executeRaw`SELECT set_config('app.club_id', ${clubId}, TRUE), set_config('app.user_id', ${userId}, TRUE)`,
    ...build(base),
  ]);
  return results.slice(2);
}
