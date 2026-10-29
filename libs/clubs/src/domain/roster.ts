import { ClubError } from './errors.js';

export type MemberRole = 'OWNER' | 'COACH' | 'STUDENT';

export interface Member {
  readonly userId: string;
  readonly role: MemberRole;
}

/** Qué roles puede invitar cada rol. */
const INVITABLE: Record<MemberRole, readonly MemberRole[]> = {
  OWNER: ['OWNER', 'COACH', 'STUDENT'],
  COACH: ['STUDENT'],
  STUDENT: [],
};

export function assertCanInvite(inviter: Member, role: MemberRole): void {
  if (!INVITABLE[inviter.role].includes(role)) {
    throw new ClubError(
      'FORBIDDEN',
      `Un ${inviter.role} no puede invitar a un ${role}`,
    );
  }
}

/**
 * Los miembros de un club y las reglas para cambiarlos.
 * Es inmutable: cada cambio devuelve un roster nuevo.
 */
export class Roster {
  private constructor(private readonly members: readonly Member[]) {}

  static of(members: readonly Member[]): Roster {
    return new Roster([...members]);
  }

  get all(): readonly Member[] {
    return this.members;
  }

  find(userId: string): Member | undefined {
    return this.members.find((m) => m.userId === userId);
  }

  /** Solo un OWNER cambia roles, y el club nunca se queda sin OWNER. */
  changeRole(actorId: string, targetId: string, role: MemberRole): Roster {
    this.requireOwner(actorId);
    const target = this.require(targetId);
    if (target.role === role) return this;
    if (target.role === 'OWNER') this.assertNotLastOwner();

    return new Roster(
      this.members.map((m) => (m.userId === targetId ? { ...m, role } : m)),
    );
  }

  /** Un OWNER saca a cualquiera; cualquier miembro puede salirse. El último OWNER no puede irse. */
  remove(actorId: string, targetId: string): Roster {
    if (actorId !== targetId) this.requireOwner(actorId);
    const target = this.require(targetId);
    if (target.role === 'OWNER') this.assertNotLastOwner();

    return new Roster(this.members.filter((m) => m.userId !== targetId));
  }

  private require(userId: string): Member {
    const member = this.find(userId);
    if (!member)
      throw new ClubError('MEMBER_NOT_FOUND', 'No es miembro del club');
    return member;
  }

  private requireOwner(userId: string): void {
    if (this.require(userId).role !== 'OWNER') {
      throw new ClubError(
        'FORBIDDEN',
        'Solo un dueño del club puede hacer esto',
      );
    }
  }

  private assertNotLastOwner(): void {
    if (this.members.filter((m) => m.role === 'OWNER').length <= 1) {
      throw new ClubError(
        'LAST_OWNER',
        'El club tiene que tener al menos un dueño',
      );
    }
  }
}
