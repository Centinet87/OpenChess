import type { NewClub } from '../domain/club.js';
import { ClubError } from '../domain/errors.js';
import type { Invitation } from '../domain/invitation.js';
import type { ClubRole } from '../domain/role.js';
import type { Member } from '../domain/roster.js';
import { ClubsUseCases } from './clubs.use-cases.js';
import type {
  ClubsRepository,
  InvitationsRepository,
  MemberRow,
  MyClub,
  RolesRepository,
} from './ports.js';

class MemoryClubs implements ClubsRepository, RolesRepository {
  clubs = new Map<string, NewClub>();
  memberships = new Map<string, Member[]>();
  roleRows = new Map<string, ClubRole>();

  async slugExists(slug: string) {
    return [...this.clubs.values()].some((c) => c.slug === slug);
  }
  async createWithOwner(
    club: NewClub & { id: string },
    roles: readonly ClubRole[],
    ownerId: string,
  ) {
    this.clubs.set(club.id, club);
    await this.saveRoles(roles);
    const owner = roles.find((r) => r.isOwner) as ClubRole;
    this.memberships.set(club.id, [{ userId: ownerId, roleId: owner.id }]);
  }
  async listForUser(userId: string): Promise<MyClub[]> {
    return [...this.memberships].flatMap(([id, ms]) =>
      ms
        .filter((m) => m.userId === userId)
        .map((m) => {
          const role = this.roleRows.get(m.roleId) as ClubRole;
          return {
            id,
            ...(this.clubs.get(id) as NewClub),
            role: {
              id: role.id,
              name: role.name,
              color: role.color,
              position: role.position,
              isOwner: role.isOwner,
            },
          };
        }),
    );
  }
  async members(clubId: string): Promise<MemberRow[]> {
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
  async updateRole(clubId: string, userId: string, roleId: string) {
    this.memberships.set(
      clubId,
      (this.memberships.get(clubId) ?? []).map((m) =>
        m.userId === userId ? { ...m, roleId } : m,
      ),
    );
  }
  async removeMember(clubId: string, userId: string) {
    this.memberships.set(
      clubId,
      (this.memberships.get(clubId) ?? []).filter((m) => m.userId !== userId),
    );
  }
  async roles(clubId: string) {
    return [...this.roleRows.values()].filter((r) => r.clubId === clubId);
  }
  async saveRoles(roles: readonly ClubRole[]) {
    for (const r of roles) this.roleRows.set(r.id, r);
  }
  async deleteRole(_clubId: string, roleId: string) {
    this.roleRows.delete(roleId);
  }
}

class MemoryInvitations implements InvitationsRepository {
  rows = new Map<string, Invitation & { tokenHash: string }>();

  async create(input: {
    clubId: string;
    tokenHash: string;
    roleId: string;
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
  let ids = 0;
  let now = new Date('2026-01-01T00:00:00Z');
  const clubs = new MemoryClubs();
  const invitations = new MemoryInvitations();
  const useCases = new ClubsUseCases({
    clubs,
    roles: clubs,
    invitations,
    tokens: {
      issue: () => ({ token: `t${++n}`, hash: `h:t${n}` }),
      hash: (t) => `h:${t}`,
    },
    clock: { now: () => now },
    newId: () => `id-${++ids}`,
  });
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

/** Club de Ana con sus roles iniciales. */
async function club() {
  const ctx = setup();
  const { id } = await ctx.useCases.createClub('ana', {
    slug: 'club',
    name: 'Club',
  });
  const roles = await ctx.useCases.listRoles(id);
  const role = (name: string) => roles.find((r) => r.name === name) as ClubRole;
  return { ...ctx, id, role };
}

describe('ClubsUseCases', () => {
  it('quien crea el club queda como Admin y el club parte con tres roles', async () => {
    const { useCases, id } = await club();
    const [mine] = await useCases.listMyClubs('ana');
    expect(mine).toMatchObject({
      id,
      slug: 'club',
      role: { name: 'Admin', isOwner: true },
    });
    expect((await useCases.listRoles(id)).map((r) => r.name)).toEqual([
      'Admin',
      'Profesor',
      'Alumno',
    ]);
    expect(
      await errorCode(
        useCases.createClub('beto', { slug: 'club', name: 'Otro club' }),
      ),
    ).toBe('SLUG_TAKEN');
  });

  it('invitación: se acepta una vez y entrega el rol invitado', async () => {
    const { useCases, id, role } = await club();
    const { token } = await useCases.invite(id, 'ana', role('Profesor').id);

    expect(await useCases.acceptInvitation(id, 'beto', token)).toMatchObject({
      role: { name: 'Profesor' },
    });
    expect(await errorCode(useCases.acceptInvitation(id, 'caro', token))).toBe(
      'INVITATION_USED',
    );
  });

  it('una invitación no sirve en otro club, ni vencida', async () => {
    const { useCases, id, role, advance } = await club();
    const other = await useCases.createClub('beto', {
      slug: 'otro',
      name: 'Otro',
    });
    const { token } = await useCases.invite(id, 'ana', role('Alumno').id);
    expect(
      await errorCode(useCases.acceptInvitation(other.id, 'caro', token)),
    ).toBe('INVITATION_NOT_FOUND');

    advance(8 * 24 * 3600 * 1000);
    expect(await errorCode(useCases.acceptInvitation(id, 'caro', token))).toBe(
      'INVITATION_EXPIRED',
    );
  });

  it('alguien que no es miembro no puede invitar', async () => {
    const { useCases, id, role } = await club();
    expect(
      await errorCode(useCases.invite(id, 'intruso', role('Alumno').id)),
    ).toBe('FORBIDDEN');
  });

  it('el admin crea un rol "Miembro del club", lo ubica en la jerarquía y se lo asigna a alguien', async () => {
    const { useCases, id, role } = await club();
    const { token } = await useCases.invite(id, 'ana', role('Alumno').id);
    await useCases.acceptInvitation(id, 'beto', token);

    const miembro = await useCases.createRole(id, 'ana', {
      name: 'Miembro del club',
      color: '#27ae60',
      permissions: ['PLAY_GAMES'],
    });
    await useCases.reorderRoles(id, 'ana', [
      role('Profesor').id,
      miembro.id,
      role('Alumno').id,
    ]);
    await useCases.changeMemberRole(id, 'ana', 'beto', miembro.id);

    const members = await useCases.listMembers(id);
    expect(members.map((m) => [m.displayName, m.role.name])).toEqual([
      ['ana', 'Admin'],
      ['beto', 'Miembro del club'],
    ]);
    expect((await useCases.myRole(id, 'beto')).permissions).toEqual([
      'PLAY_GAMES',
    ]);
  });

  it('no se borra un rol en uso, y al borrar otro no quedan huecos', async () => {
    const { useCases, id, role } = await club();
    const { token } = await useCases.invite(id, 'ana', role('Alumno').id);
    await useCases.acceptInvitation(id, 'beto', token);

    expect(
      await errorCode(useCases.deleteRole(id, 'ana', role('Alumno').id)),
    ).toBe('ROLE_IN_USE');
    await useCases.deleteRole(id, 'ana', role('Profesor').id);
    expect(
      (await useCases.listRoles(id)).map((r) => [r.name, r.position]),
    ).toEqual([
      ['Admin', 0],
      ['Alumno', 1],
    ]);
  });

  it('sin MANAGE_ROLES no se crean roles', async () => {
    const { useCases, id, role } = await club();
    const { token } = await useCases.invite(id, 'ana', role('Profesor').id);
    await useCases.acceptInvitation(id, 'beto', token);
    expect(
      await errorCode(
        useCases.createRole(id, 'beto', { name: 'X', permissions: [] }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('no se guarda un cambio de rol que rompe las reglas', async () => {
    const { useCases, clubs, id, role } = await club();
    expect(
      await errorCode(
        useCases.changeMemberRole(id, 'ana', 'ana', role('Alumno').id),
      ),
    ).toBe('LAST_OWNER');
    expect(await clubs.findMember(id, 'ana')).toEqual({
      userId: 'ana',
      roleId: role('Admin').id,
    });
  });
});
