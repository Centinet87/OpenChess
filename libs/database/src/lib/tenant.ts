import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface TenantContext {
  clubId?: string;
  userId?: string;
}

/**
 * Baja al rol app_user y fija app.club_id / app.user_id hasta el final de la
 * transacción. Va en una sola sentencia: set_config('role', …, TRUE) equivale a
 * SET LOCAL ROLE, y así cada consulta ahorra un viaje a la BD.
 */
function setContext(base: PrismaClient, context: TenantContext) {
  const { clubId = '', userId = '' } = context;
  return base.$executeRaw`SELECT set_config('role', 'app_user', TRUE), set_config('app.club_id', ${clubId}, TRUE), set_config('app.user_id', ${userId}, TRUE)`;
}

/**
 * Envuelve cada consulta de modelo en una transacción que baja al rol app_user
 * y fija app.club_id / app.user_id, para que actúen las políticas RLS.
 * Sin contexto, las tablas con RLS no devuelven filas.
 *
 * Limitación: $queryRaw/$executeRaw no pasan por aquí, y una consulta dentro de un
 * $transaction interactivo tampoco. Si se necesitan, fijar el contexto a mano.
 * No usar un $transaction interactivo con este cliente: retiene una conexión y
 * cada consulta de adentro pide otra, así que con un pool chico se bloquea.
 *
 * Limitación: cada consulta cuesta una transacción con dos sentencias (contexto y
 * la consulta), y Prisma no puede agruparlas. Si pesa, fijar el contexto una
 * vez por request en una transacción.
 */
export function withTenantContext(
  base: PrismaClient,
  getContext: () => TenantContext,
) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            setContext(base, getContext()),
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
  const results = await base.$transaction([
    setContext(base, context),
    ...build(base),
  ]);
  return results.slice(1);
}
