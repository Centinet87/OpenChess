import { newClub, parseSlug } from './club.js';
import { ClubError } from './errors.js';
import { assertAcceptable, invitationExpiry } from './invitation.js';
import { assertCanInvite, Roster } from './roster.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ClubError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('slug', () => {
  it.each(['abc', 'club-uno', 'a1b2', 'MiClub'])('acepta %s', (s) => {
    expect(parseSlug(s)).toBe(s.toLowerCase());
  });

  it.each(['ab', '-abc', 'abc-', 'a--b', 'a_b', 'www', 'api', 'x'.repeat(33)])(
    'rechaza %s',
    (s) => {
      expect(code(() => parseSlug(s))).toBe('INVALID_SLUG');
    },
  );

  it('valida el nombre', () => {
    expect(code(() => newClub({ slug: 'abc', name: ' ' }))).toBe(
      'INVALID_NAME',
    );
    expect(newClub({ slug: 'abc', name: '  Club A ' }).name).toBe('Club A');
  });
});

describe('invitaciones', () => {
  const owner = { userId: 'o', role: 'OWNER' } as const;
  const coach = { userId: 'c', role: 'COACH' } as const;
  const student = { userId: 's', role: 'STUDENT' } as const;

  it('cada rol invita solo a los roles permitidos', () => {
    expect(code(() => assertCanInvite(owner, 'COACH'))).toBeUndefined();
    expect(code(() => assertCanInvite(coach, 'STUDENT'))).toBeUndefined();
    expect(code(() => assertCanInvite(coach, 'COACH'))).toBe('FORBIDDEN');
    expect(code(() => assertCanInvite(student, 'STUDENT'))).toBe('FORBIDDEN');
  });

  const now = new Date('2026-01-01T00:00:00Z');
  const base = {
    id: 'i',
    clubId: 'c',
    role: 'STUDENT' as const,
    expiresAt: invitationExpiry(now),
    acceptedAt: null,
  };

  it('vence a los 7 días', () => {
    const later = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    expect(code(() => assertAcceptable(base, later, false))).toBe(
      'INVITATION_EXPIRED',
    );
  });

  it('no se usa dos veces ni la usa alguien que ya es miembro', () => {
    expect(
      code(() => assertAcceptable({ ...base, acceptedAt: now }, now, false)),
    ).toBe('INVITATION_USED');
    expect(code(() => assertAcceptable(base, now, true))).toBe(
      'ALREADY_MEMBER',
    );
    expect(code(() => assertAcceptable(base, now, false))).toBeUndefined();
  });
});

describe('Roster', () => {
  const roster = Roster.of([
    { userId: 'o', role: 'OWNER' },
    { userId: 'c', role: 'COACH' },
    { userId: 's', role: 'STUDENT' },
  ]);

  it('solo un OWNER cambia roles', () => {
    expect(code(() => roster.changeRole('c', 's', 'COACH'))).toBe('FORBIDDEN');
    expect(roster.changeRole('o', 's', 'COACH').find('s')?.role).toBe('COACH');
  });

  it('no deja al club sin OWNER', () => {
    expect(code(() => roster.changeRole('o', 'o', 'COACH'))).toBe('LAST_OWNER');
    expect(code(() => roster.remove('o', 'o'))).toBe('LAST_OWNER');
  });

  it('con dos OWNER, uno puede bajarse', () => {
    const two = roster.changeRole('o', 'c', 'OWNER');
    expect(two.changeRole('o', 'o', 'COACH').find('o')?.role).toBe('COACH');
  });

  it('un miembro puede salirse, pero no sacar a otro', () => {
    expect(roster.remove('s', 's').find('s')).toBeUndefined();
    expect(code(() => roster.remove('s', 'c'))).toBe('FORBIDDEN');
  });

  it('no muta el roster original', () => {
    roster.changeRole('o', 's', 'COACH');
    expect(roster.find('s')?.role).toBe('STUDENT');
  });
});
