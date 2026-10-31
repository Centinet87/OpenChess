import { ClubError } from '../errors';
import { newClub, parseSlug } from './club';
import { assertAcceptable, invitationExpiry } from './invitation';

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
  const now = new Date('2026-01-01T00:00:00Z');
  const base = {
    id: 'i',
    clubId: 'c',
    roleId: 'alumno',
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
