import { LinkError } from '../domain/errors.js';
import type {
  ExternalGame,
  ImportedGameSnapshot,
} from '../domain/external-game.js';
import type { LinkedAccountSnapshot } from '../domain/linked-account.js';
import type { Platform } from '../domain/platform.js';
import { LinkedAccountsUseCases } from './linked-accounts.use-cases.js';
import type {
  ChessPlatform,
  ImportedGamesRepository,
  LinkedAccountsRepository,
  PlatformProfile,
} from './ports.js';

class FakePlatform implements ChessPlatform {
  readonly profiles = new Map<string, PlatformProfile>();
  games: ExternalGame[] = [];
  constructor(readonly platform: Platform) {}

  async profile(username: string) {
    return this.profiles.get(username) ?? null;
  }

  async recentGames(username: string) {
    return this.games.filter(
      (g) => g.white === username || g.black === username,
    );
  }
}

/** Repositorio en memoria con las mismas reglas que el de Prisma. */
class MemoryAccounts implements LinkedAccountsRepository {
  readonly rows: LinkedAccountSnapshot[] = [];
  /** userId → clubs */
  readonly memberships = new Map<string, string[]>();

  async findByUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId);
  }

  async find(userId: string, platform: Platform) {
    return (
      this.rows.find((r) => r.userId === userId && r.platform === platform) ??
      null
    );
  }

  async save(account: LinkedAccountSnapshot) {
    const takenByOther = this.rows.some(
      (r) =>
        r.userId !== account.userId &&
        r.platform === account.platform &&
        r.username === account.username &&
        r.verifiedAt &&
        account.verifiedAt,
    );
    if (takenByOther) return false;
    await this.delete(account.userId, account.platform);
    this.rows.push(account);
    return true;
  }

  async delete(userId: string, platform: Platform) {
    const i = this.rows.findIndex(
      (r) => r.userId === userId && r.platform === platform,
    );
    if (i >= 0) this.rows.splice(i, 1);
  }

  async verifiedMembers(
    clubId: string,
    platform: Platform,
    usernames: readonly string[],
  ) {
    const map = new Map<string, string>();
    for (const r of this.rows) {
      if (
        r.platform === platform &&
        r.verifiedAt &&
        usernames.includes(r.username) &&
        this.memberships.get(r.userId)?.includes(clubId)
      ) {
        map.set(r.username, r.userId);
      }
    }
    return map;
  }
}

class MemoryGames implements ImportedGamesRepository {
  readonly rows: ImportedGameSnapshot[] = [];

  async insertNew(games: readonly ImportedGameSnapshot[]) {
    const fresh = games.filter(
      (g) =>
        !this.rows.some(
          (r) =>
            r.clubId === g.clubId &&
            r.platform === g.platform &&
            r.externalId === g.externalId,
        ),
    );
    this.rows.push(...fresh);
    return fresh;
  }

  async list(clubId: string) {
    return this.rows.filter((r) => r.clubId === clubId);
  }

  async find(clubId: string, id: string) {
    return this.rows.find((r) => r.clubId === clubId && r.id === id) ?? null;
  }
}

const profile = (displayName: string, editableText = ''): PlatformProfile => ({
  displayName,
  ratings: { blitz: 1600 },
  editableText,
});

function game(
  externalId: string,
  white: string | null,
  black: string | null,
  extra: Partial<ExternalGame> = {},
): ExternalGame {
  return {
    platform: 'chesscom',
    externalId,
    url: `https://www.chess.com/game/live/${externalId}`,
    white,
    black,
    whiteName: white ?? 'Computadora',
    blackName: black ?? 'Computadora',
    result: '1-0',
    speed: 'blitz',
    standard: true,
    pgn: '1. e4 e5 1-0',
    playedAt: new Date(Number(externalId) * 1000),
    ...extra,
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (e) {
    return e instanceof LinkError ? e.code : 'OTHER';
  }
}

describe('LinkedAccountsUseCases', () => {
  let lichess: FakePlatform;
  let chesscom: FakePlatform;
  let accounts: MemoryAccounts;
  let games: MemoryGames;
  let published: ImportedGameSnapshot[];
  let uc: LinkedAccountsUseCases;
  let ids = 0;

  beforeEach(() => {
    lichess = new FakePlatform('lichess');
    chesscom = new FakePlatform('chesscom');
    accounts = new MemoryAccounts();
    games = new MemoryGames();
    published = [];
    uc = new LinkedAccountsUseCases({
      accounts,
      games,
      platforms: { lichess, chesscom },
      publisher: { publish: (g) => published.push(g) },
      newId: () => `id-${++ids}`,
      newCode: () => 'openchess-abc123',
      now: () => new Date('2026-10-29T12:00:00Z'),
    });
    chesscom.profiles.set('ana_c', profile('Ana_C'));
    chesscom.profiles.set('beto', profile('Beto'));
    lichess.profiles.set('ana', profile('Ana'));
  });

  describe('Chess.com: verificar con un código en el perfil', () => {
    it('queda pendiente hasta que el código aparece en el perfil', async () => {
      const pending = await uc.startVerification(
        'u-ana',
        'chesscom',
        ' Ana_C ',
      );
      expect(pending).toMatchObject({
        username: 'ana_c',
        displayName: 'Ana_C',
        verificationCode: 'openchess-abc123',
        verifiedAt: null,
      });

      expect(await code(uc.verify('u-ana', 'chesscom'))).toBe('CODE_NOT_FOUND');

      chesscom.profiles.set(
        'ana_c',
        profile('Ana_C', 'Santiago openchess-abc123'),
      );
      const verified = await uc.verify('u-ana', 'chesscom');
      expect(verified).toMatchObject({
        verificationCode: null,
        ratings: { blitz: 1600 },
      });
      expect(verified.verifiedAt).not.toBeNull();
    });

    it('no se puede reclamar una cuenta que no existe, ni un nombre inválido', async () => {
      expect(
        await code(uc.startVerification('u-ana', 'chesscom', 'nadie')),
      ).toBe('ACCOUNT_NOT_FOUND');
      expect(await code(uc.startVerification('u-ana', 'chesscom', 'a b'))).toBe(
        'INVALID_USERNAME',
      );
      expect(await code(uc.verify('u-ana', 'chesscom'))).toBe('NOT_PENDING');
    });

    it('una cuenta verificada por otra persona no se puede verificar de nuevo', async () => {
      chesscom.profiles.set('beto', profile('Beto', 'openchess-abc123'));
      await uc.startVerification('u-beto', 'chesscom', 'beto');
      await uc.verify('u-beto', 'chesscom');

      // Otro la reclama: puede quedar pendiente, pero no verificarse.
      await uc.startVerification('u-intruso', 'chesscom', 'beto');
      expect(await code(uc.verify('u-intruso', 'chesscom'))).toBe(
        'ALREADY_LINKED',
      );
    });
  });

  it('Lichess: después de iniciar sesión queda verificada de entrada', async () => {
    const account = await uc.linkVerified('u-ana', 'lichess', 'Ana');
    expect(account).toMatchObject({ username: 'ana', displayName: 'Ana' });
    expect(account.verifiedAt).not.toBeNull();
  });

  it('refresh no vuelve a pedir ratings recientes, y exige la cuenta verificada', async () => {
    expect(await code(uc.refresh('u-ana', 'lichess'))).toBe('NOT_LINKED');
    await uc.linkVerified('u-ana', 'lichess', 'ana');
    lichess.profiles.set('ana', {
      ...profile('Ana'),
      ratings: { blitz: 2000 },
    });
    expect((await uc.refresh('u-ana', 'lichess')).ratings).toEqual({
      blitz: 1600,
    });
  });

  describe('importar partidas', () => {
    beforeEach(async () => {
      for (const [user, name] of [
        ['u-ana', 'ana_c'],
        ['u-beto', 'beto'],
      ]) {
        chesscom.profiles.set(name, profile(name, 'openchess-abc123'));
        await uc.startVerification(user, 'chesscom', name);
        await uc.verify(user, 'chesscom');
        accounts.memberships.set(user, ['club']);
      }
      chesscom.games = [
        game('3', 'ana_c', 'beto'),
        game('1', 'beto', 'ana_c', { result: '1/2-1/2' }),
        game('2', 'ana_c', 'desconocido'),
        game('4', 'ana_c', 'beto', { standard: false }),
        game('5', 'ana_c', 'beto', { result: null }),
        game('6', 'ana_c', null),
      ];
    });

    it('trae todas las del miembro y solo las de ajedrez estándar entre miembros cuentan para el ranking', async () => {
      const summary = await uc.importGames('club', 'u-ana', 'chesscom');
      expect(summary).toEqual({ found: 6, imported: 6, rated: 2 });
      // En orden de juego
      expect(published.map((g) => g.externalId)).toEqual(['1', '3']);
      expect(published[0]).toMatchObject({
        whiteUserId: 'u-beto',
        blackUserId: 'u-ana',
        importedBy: 'u-ana',
      });
      const stranger = games.rows.find((g) => g.externalId === '2');
      expect(stranger).toMatchObject({
        whiteUserId: 'u-ana',
        blackUserId: null,
      });
    });

    it('si el otro miembro importa las mismas partidas, no se repiten ni se cuentan dos veces', async () => {
      await uc.importGames('club', 'u-ana', 'chesscom');
      const again = await uc.importGames('club', 'u-beto', 'chesscom');
      expect(again).toMatchObject({ imported: 0, rated: 0 });
      expect(published).toHaveLength(2);
    });

    it('en otro club, quien no es miembro allí no se reconoce', async () => {
      const summary = await uc.importGames('otro-club', 'u-ana', 'chesscom');
      expect(summary.rated).toBe(0);
    });

    it('sin cuenta verificada no se puede importar', async () => {
      expect(await code(uc.importGames('club', 'u-caro', 'chesscom'))).toBe(
        'NOT_LINKED',
      );
    });
  });
});
