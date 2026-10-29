import type { NewClub } from '../domain/club.js';
import { ClubError } from '../domain/errors.js';
import type { Invitation } from '../domain/invitation.js';
import type { Member, MemberRole } from '../domain/roster.js';
import { ClubsUseCases } from './clubs.use-cases.js';
import type {
  ClubsRepository,
  InvitationsRepository,
  MemberView,
  MyClub,
} from './ports.js';

class MemoryClubs implements ClubsRepository {
  clubs = new Map<string, NewClub>();
  memberships = new Map<string, Member[]>();

  async slugExists(slug: string) {
    return [...this.clubs.values()].some((c) => c.slug === slug);
  }
  async createWithOwner(club: NewClub, ownerId: string) {
    const id = `club-${this.clubs.size + 1}`;
    this.clubs.set(id, club);
    this.memberships.set(id, [{ userId: ownerId, role: 'OWNER' }]);
    return { id };
  }
  async listForUser(userId: string): Promise<MyClub[]> {
    return [...this.memberships].flatMap(([id, ms]) =>
      ms
        .filter((m) => m.userId === userId)
        .map((m) => ({ id, ...(this.clubs.get(id) as NewClub), role: m.role })),
    );
  }
  async members(clubId: string): Promise<MemberView[]> {
    return (this.memberships.get(clubId) ?? []).map((m) => ({
      ...m,
      displayName: m.userId,
    }));
  }
  async findMember(clubId: string, userId: string) {
    return (
      this.memberships.get(clubId)?.find((m) => m.userId === userId) ?? null
    );
  }
  async addMember(clubId: string, member: Member) {
    this.memberships.set(clubId, [
      ...(this.memberships.get(clubId) ?? []),
      member,
    ]);
  }
  async updateRole(clubId: string, userId: string, role: MemberRole) {
    this.memberships.set(
      clubId,
      (this.memberships.get(clubId) ?? []).map((m) =>
        m.userId === userId ? { ...m, role } : m,
      ),
    );
  }
  async removeMember(clubId: string, userId: string) {
    this.memberships.set(
      clubId,
      (this.memberships.get(clubId) ?? []).filter((m) => m.userId !== userId),
    );
  }
}

class MemoryInvitations implements InvitationsRepository {
  rows = new Map<string, Invitation & { tokenHash: string }>();

  async create(input: {
    clubId: string;
    tokenHash: string;
    role: MemberRole;
    expiresAt: Date;
  }) {
    const id = `inv-${this.rows.size + 1}`;
    this.rows.set(id, { id, acceptedAt: null, ...input });
  }
  async findByTokenHash(tokenHash: string) {
    return (
      [...this.rows.values()].find((r) => r.tokenHash === tokenHash) ?? null
    );
  }
  async markAccepted(id: string, at: Date) {
    const row = this.rows.get(id);
    if (!row || row.acceptedAt) return false;
    this.rows.set(id, { ...row, acceptedAt: at });
    return true;
  }
}

function setup() {
  let n = 0;
  let now = new Date('2026-01-01T00:00:00Z');
  const clubs = new MemoryClubs();
  const invitations = new MemoryInvitations();
  const useCases = new ClubsUseCases(
    clubs,
    invitations,
    {
      issue: () => ({ token: `t${++n}`, hash: `h:t${n}` }),
      hash: (t) => `h:${t}`,
    },
    { now: () => now },
  );
  return {
    useCases,
    clubs,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

async function errorCode(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return e instanceof ClubError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('ClubsUseCases', () => {
  it('quien crea el club queda como OWNER y el slug no se repite', async () => {
    const { useCases } = setup();
    const { id } = await useCases.createClub('ana', {
      slug: 'Ajedrez-Sur',
      name: 'Ajedrez Sur',
    });

    expect(await useCases.listMyClubs('ana')).toEqual([
      { id, slug: 'ajedrez-sur', name: 'Ajedrez Sur', role: 'OWNER' },
    ]);
    expect(
      await errorCode(
        useCases.createClub('beto', { slug: 'ajedrez-sur', name: 'Otro' }),
      ),
    ).toBe('SLUG_TAKEN');
  });

  it('invitación: se acepta una vez y entrega el rol invitado', async () => {
    const { useCases } = setup();
    const { id } = await useCases.createClub('ana', {
      slug: 'club',
      name: 'Club',
    });
    const { token } = await useCases.invite(id, 'ana', 'COACH');

    expect(await useCases.acceptInvitation(id, 'beto', token)).toEqual({
      role: 'COACH',
    });
    expect(await errorCode(useCases.acceptInvitation(id, 'caro', token))).toBe(
      'INVITATION_USED',
    );
  });

  it('una invitación no sirve en otro club', async () => {
    const { useCases } = setup();
    const a = await useCases.createClub('ana', {
      slug: 'club-a',
      name: 'Club A',
    });
    const b = await useCases.createClub('beto', {
      slug: 'club-b',
      name: 'Club B',
    });
    const { token } = await useCases.invite(a.id, 'ana', 'STUDENT');

    expect(
      await errorCode(useCases.acceptInvitation(b.id, 'caro', token)),
    ).toBe('INVITATION_NOT_FOUND');
  });

  it('una invitación vencida se rechaza', async () => {
    const { useCases, advance } = setup();
    const { id } = await useCases.createClub('ana', {
      slug: 'club',
      name: 'Club',
    });
    const { token } = await useCases.invite(id, 'ana', 'STUDENT');
    advance(8 * 24 * 3600 * 1000);

    expect(await errorCode(useCases.acceptInvitation(id, 'beto', token))).toBe(
      'INVITATION_EXPIRED',
    );
  });

  it('alguien que no es miembro no puede invitar', async () => {
    const { useCases } = setup();
    const { id } = await useCases.createClub('ana', {
      slug: 'club',
      name: 'Club',
    });
    expect(await errorCode(useCases.invite(id, 'intruso', 'STUDENT'))).toBe(
      'FORBIDDEN',
    );
  });

  it('no se guarda un cambio de rol que rompe las reglas', async () => {
    const { useCases, clubs } = setup();
    const { id } = await useCases.createClub('ana', {
      slug: 'club',
      name: 'Club',
    });

    expect(
      await errorCode(useCases.changeRole(id, 'ana', 'ana', 'STUDENT')),
    ).toBe('LAST_OWNER');
    expect(await clubs.findMember(id, 'ana')).toEqual({
      userId: 'ana',
      role: 'OWNER',
    });
  });
});
