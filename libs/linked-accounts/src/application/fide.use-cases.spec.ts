import { LinkError } from '../domain/errors.js';
import {
  referenceRating,
  type FideLinkSnapshot,
  type FideProfile,
} from '../domain/fide.js';
import { FideUseCases } from './fide.use-cases.js';
import type { FideLinksRepository } from './ports.js';

class MemoryFide implements FideLinksRepository {
  readonly rows: FideLinkSnapshot[] = [];
  readonly members = new Set(['ana', 'beto']);

  async find(clubId: string, userId: string) {
    return (
      this.rows.find((r) => r.clubId === clubId && r.userId === userId) ?? null
    );
  }

  async list(clubId: string) {
    return this.rows.filter((r) => r.clubId === clubId);
  }

  async save(link: FideLinkSnapshot) {
    const taken = this.rows.some(
      (r) =>
        r.clubId === link.clubId &&
        r.fideId === link.fideId &&
        r.userId !== link.userId,
    );
    if (taken) return false;
    await this.delete(link.clubId, link.userId);
    this.rows.push(link);
    return true;
  }

  async delete(clubId: string, userId: string) {
    const i = this.rows.findIndex(
      (r) => r.clubId === clubId && r.userId === userId,
    );
    if (i >= 0) this.rows.splice(i, 1);
  }

  async isMember(_clubId: string, userId: string) {
    return this.members.has(userId);
  }
}

const carlsen: FideProfile = {
  fideId: '1503014',
  name: 'Carlsen, Magnus',
  federation: 'Norway',
  title: 'Grandmaster',
  ratings: { standard: 2830, rapid: 2820, blitz: 2880 },
};

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (e) {
    return e instanceof LinkError ? e.code : 'OTHER';
  }
}

describe('FideUseCases', () => {
  let repo: MemoryFide;
  let profiles: Map<string, FideProfile>;
  let now: Date;
  let fide: FideUseCases;
  const owner = { userId: 'ana', role: 'OWNER' as const };

  beforeEach(() => {
    repo = new MemoryFide();
    profiles = new Map([[carlsen.fideId, carlsen]]);
    now = new Date('2026-10-29T12:00:00Z');
    fide = new FideUseCases({
      links: repo,
      directory: { profile: async (id) => profiles.get(id) ?? null },
      now: () => now,
    });
  });

  it('un admin asigna el FIDE ID de un miembro y se guarda su ficha', async () => {
    const link = await fide.link('club', owner, 'beto', ' 1503014 ');
    expect(link).toMatchObject({
      clubId: 'club',
      userId: 'beto',
      fideId: '1503014',
      name: 'Carlsen, Magnus',
      linkedBy: 'ana',
      ratings: { standard: 2830 },
    });
    expect(await fide.get('club', 'beto')).toEqual(link);
  });

  it('solo un admin puede asignarlo o quitarlo; ni un profesor ni el propio miembro', async () => {
    expect(
      await code(
        fide.link(
          'club',
          { userId: 'beto', role: 'STUDENT' },
          'beto',
          '1503014',
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await code(
        fide.link('club', { userId: 'c', role: 'COACH' }, 'beto', '1503014'),
      ),
    ).toBe('FORBIDDEN');
    expect(await code(fide.unlink('club', { role: 'STUDENT' }, 'beto'))).toBe(
      'FORBIDDEN',
    );
  });

  it('valida el FIDE ID, que exista y que la persona sea del club', async () => {
    expect(await code(fide.link('club', owner, 'beto', 'abc'))).toBe(
      'INVALID_FIDE_ID',
    );
    expect(await code(fide.link('club', owner, 'beto', '999'))).toBe(
      'ACCOUNT_NOT_FOUND',
    );
    expect(await code(fide.link('club', owner, 'nadie', '1503014'))).toBe(
      'NOT_MEMBER',
    );
  });

  it('un FIDE ID no se puede asignar a dos miembros del mismo club', async () => {
    await fide.link('club', owner, 'beto', '1503014');
    expect(await code(fide.link('club', owner, 'ana', '1503014'))).toBe(
      'ALREADY_LINKED',
    );
  });

  it('refresh relee la ficha solo si tiene más de un día', async () => {
    await fide.link('club', owner, 'beto', '1503014');
    profiles.set(carlsen.fideId, { ...carlsen, ratings: { standard: 2840 } });

    expect((await fide.refresh('club', 'beto')).ratings.standard).toBe(2830);
    now = new Date('2026-10-31T12:00:00Z');
    expect((await fide.refresh('club', 'beto')).ratings.standard).toBe(2840);
    expect(await code(fide.refresh('club', 'ana'))).toBe('NOT_LINKED');
  });

  it('el Elo de referencia es el clásico, o el de rápidas o blitz si no tiene', () => {
    expect(referenceRating({ standard: 2000, rapid: 1900 })).toBe(2000);
    expect(referenceRating({ blitz: 1800 })).toBe(1800);
    expect(referenceRating({})).toBeNull();
  });
});
