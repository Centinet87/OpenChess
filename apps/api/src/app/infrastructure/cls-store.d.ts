import type { RoleGrant } from '@openchess/clubs';

// Claves del contexto de la request: así un typo en cls.get/cls.set no compila.
declare module 'nestjs-cls' {
  interface ClsStore {
    /** Club del subdominio, antes de comprobar la membresía (TenantMiddleware). */
    requestedClubId: string;
    /** Subdominio del club de la request (TenantMiddleware). */
    clubSlug: string;
    /** Club que usa RLS, fijado por ClubMemberGuard. */
    clubId: string;
    /** Usuario autenticado, fijado por AuthGuard. */
    userId: string;
    /** Rol del usuario en el club y sus permisos, fijado por ClubMemberGuard. */
    role: RoleGrant;
  }
}
