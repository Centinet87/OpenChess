# billing

Planes del club y su suscripción. No depende de Prisma, de Nest ni de otras libs de negocio.

- `src/domain/plan.ts`: plan gratis (15 miembros) y Pro (sin límite).
- `src/domain/subscription.ts`: solo una suscripción activa da el plan Pro.
- `src/application`: casos de uso y los puertos que implementa la API en `apps/api/src/billing` (hoy, Mercado Pago).

El club pasa a Pro cuando el proveedor confirma el pago: ante un aviso (webhook) se consulta el estado real, nunca se confía en el aviso.

Tests: `nx test billing`.
