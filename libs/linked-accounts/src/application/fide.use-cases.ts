import { LinkError } from '../domain/errors.js';
import { normalizeFideId, type FideLinkSnapshot } from '../domain/fide.js';
import type { FideDeps } from './ports.js';

/** Los Elo FIDE cambian una vez al mes: se vuelven a pedir, como mucho, una vez al día. */
const FIDE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Quién puede asignar FIDE ID. Los roles vienen de memberships. */
export type ClubRole = 'OWNER' | 'COACH' | 'STUDENT';

/**
 * FIDE ID de los miembros de un club. FIDE no tiene login, así que no hay forma
 * de que la persona pruebe que es suyo: lo agrega un admin del club, que la
 * conoce, y solo vale dentro de ese club.
 */
export class FideUseCases {
  constructor(private readonly deps: FideDeps) {}

  async link(
    clubId: string,
    admin: { userId: string; role: ClubRole },
    memberId: string,
    fideId: string,
  ): Promise<FideLinkSnapshot> {
    assertAdmin(admin.role);
    const id = normalizeFideId(fideId);
    if (!(await this.deps.links.isMember(clubId, memberId))) {
      throw new LinkError('NOT_MEMBER', 'No es miembro de este club');
    }
    const profile = await this.deps.directory.profile(id);
    if (!profile) {
      throw new LinkError('ACCOUNT_NOT_FOUND', 'No existe ese FIDE ID');
    }
    const link: FideLinkSnapshot = {
      ...profile,
      clubId,
      userId: memberId,
      linkedBy: admin.userId,
      ratingsUpdatedAt: this.deps.now(),
    };
    if (!(await this.deps.links.save(link))) {
      throw new LinkError(
        'ALREADY_LINKED',
        'Ese FIDE ID ya está asignado a otro miembro del club',
      );
    }
    return link;
  }

  async unlink(
    clubId: string,
    admin: { role: ClubRole },
    memberId: string,
  ): Promise<void> {
    assertAdmin(admin.role);
    await this.deps.links.delete(clubId, memberId);
  }

  get(clubId: string, memberId: string): Promise<FideLinkSnapshot | null> {
    return this.deps.links.find(clubId, memberId);
  }

  list(clubId: string): Promise<FideLinkSnapshot[]> {
    return this.deps.links.list(clubId);
  }

  /** Vuelve a leer la ficha si tiene más de un día. Cualquier miembro puede pedirlo: es público. */
  async refresh(clubId: string, memberId: string): Promise<FideLinkSnapshot> {
    const link = await this.deps.links.find(clubId, memberId);
    if (!link) {
      throw new LinkError('NOT_LINKED', 'Ese miembro no tiene FIDE ID');
    }
    const now = this.deps.now();
    if (now.getTime() - link.ratingsUpdatedAt.getTime() < FIDE_MAX_AGE_MS) {
      return link;
    }
    const profile = await this.deps.directory.profile(link.fideId);
    if (!profile) {
      throw new LinkError('ACCOUNT_NOT_FOUND', 'No existe ese FIDE ID');
    }
    const updated = { ...link, ...profile, ratingsUpdatedAt: now };
    await this.deps.links.save(updated);
    return updated;
  }
}

function assertAdmin(role: ClubRole): void {
  if (role !== 'OWNER') {
    throw new LinkError(
      'FORBIDDEN',
      'Solo un admin del club puede asignar el FIDE ID',
    );
  }
}
