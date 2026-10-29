import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createPrismaClient } from './database.js';
import {
  tenantTransaction,
  withTenantContext,
  type TenantContext,
} from './tenant.js';

config({ path: '../../.env', quiet: true });

// El cliente base conecta como dueño (superusuario en local) y se salta RLS:
// solo se usa para preparar y limpiar datos.
const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
let context: TenantContext = {};
const db = withTenantContext(base, () => context);

const suffix = randomUUID().slice(0, 8);
let clubA: string;
let clubB: string;
let userA: string;
let userB: string;
/** Un rol dueño y uno de alumno por club. */
const roles = {} as Record<
  'ownerA' | 'studentA' | 'ownerB' | 'studentB',
  string
>;

beforeAll(async () => {
  const [ua, ub] = await Promise.all(
    ['a', 'b'].map((x) =>
      base.user.create({
        data: {
          email: `${x}-${suffix}@test.local`,
          passwordHash: 'x',
          displayName: x,
        },
      }),
    ),
  );
  userA = ua.id;
  userB = ub.id;

  const ca = await base.club.create({
    data: { slug: `a-${suffix}`, name: 'Club A' },
  });
  const cb = await base.club.create({
    data: { slug: `b-${suffix}`, name: 'Club B' },
  });
  clubA = ca.id;
  clubB = cb.id;

  for (const [club, owner, student] of [
    [clubA, 'ownerA', 'studentA'],
    [clubB, 'ownerB', 'studentB'],
  ] as const) {
    roles[owner] = randomUUID();
    roles[student] = randomUUID();
    await base.clubRole.createMany({
      data: [
        {
          id: roles[owner],
          clubId: club,
          name: 'Admin',
          position: 0,
          isOwner: true,
        },
        { id: roles[student], clubId: club, name: 'Alumno', position: 1 },
      ],
    });
  }

  await base.membership.createMany({
    data: [
      { clubId: clubA, userId: userA, roleId: roles.ownerA },
      { clubId: clubB, userId: userB, roleId: roles.ownerB },
    ],
  });
  const expiresAt = new Date(Date.now() + 60_000);
  await base.invitation.createMany({
    data: [
      {
        clubId: clubA,
        tokenHash: `a-${suffix}`,
        roleId: roles.studentA,
        createdById: userA,
        expiresAt,
      },
      {
        clubId: clubB,
        tokenHash: `b-${suffix}`,
        roleId: roles.studentB,
        createdById: userB,
        expiresAt,
      },
    ],
  });
});

afterAll(async () => {
  await base.club.deleteMany({ where: { id: { in: [clubA, clubB] } } });
  await base.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await base.$disconnect();
});

describe('RLS entre clubes', () => {
  it('en el club A solo se ven sus membresías, aunque la consulta no filtre', async () => {
    context = { clubId: clubA, userId: userA };
    const rows = await db.membership.findMany();
    expect(rows.map((m) => m.clubId)).toEqual([clubA]);
  });

  it('en el club A no se ven invitaciones del club B', async () => {
    context = { clubId: clubA, userId: userA };
    const rows = await db.invitation.findMany();
    expect(rows.every((i) => i.clubId === clubA)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('desde el club A no se puede insertar en el club B', async () => {
    context = { clubId: clubA, userId: userA };
    await expect(
      db.membership.create({
        data: { clubId: clubB, userId: userA, roleId: roles.ownerB },
      }),
    ).rejects.toThrow();
  });

  it('desde el club A no se puede modificar ni borrar el club B', async () => {
    context = { clubId: clubA, userId: userA };
    const updated = await db.invitation.updateMany({
      where: { clubId: clubB },
      data: { roleId: roles.ownerB },
    });
    const deleted = await db.membership.deleteMany({
      where: { clubId: clubB },
    });
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
  });

  it('desde el club A no se pueden borrar ni cambiar las membresías propias del club B', async () => {
    // userB entra al club A: ve su membresía del club B, pero no la puede tocar.
    context = { clubId: clubA, userId: userB };
    const deleted = await db.membership.deleteMany({
      where: { clubId: clubB },
    });
    const updated = await db.membership.updateMany({
      where: { clubId: clubB },
      data: { roleId: roles.studentB },
    });
    expect(deleted.count).toBe(0);
    expect(updated.count).toBe(0);

    context = { userId: userB };
    const withoutClub = await db.membership.deleteMany({
      where: { userId: userB },
    });
    expect(withoutClub.count).toBe(0);
  });

  it('sin contexto no se ve ninguna fila', async () => {
    context = {};
    expect(await db.membership.findMany()).toHaveLength(0);
    expect(await db.invitation.findMany()).toHaveLength(0);
  });

  it('sin club, un usuario solo ve sus propias membresías', async () => {
    context = { userId: userB };
    const rows = await db.membership.findMany();
    expect(rows.map((m) => m.userId)).toEqual([userB]);
  });
});

describe('RLS en el ranking', () => {
  const rating = (clubId: string, userId: string) => ({
    clubId,
    userId,
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
  });

  beforeAll(async () => {
    await base.rating.createMany({
      data: [rating(clubA, userA), rating(clubB, userB)],
    });
  });

  it('en el club A solo se ven sus ratings', async () => {
    context = { clubId: clubA, userId: userA };
    const rows = await db.rating.findMany();
    expect(rows.map((r) => r.clubId)).toEqual([clubA]);
  });

  it('una transacción desde el club A que toca el club B no guarda nada', async () => {
    await expect(
      tenantTransaction(base, { clubId: clubA, userId: userA }, (tx) => [
        tx.rating.update({
          where: { clubId_userId: { clubId: clubA, userId: userA } },
          data: { games: 1 },
        }),
        tx.rating.create({ data: rating(clubB, userA) }),
      ]),
    ).rejects.toThrow();

    const a = await base.rating.findUniqueOrThrow({
      where: { clubId_userId: { clubId: clubA, userId: userA } },
    });
    expect(a.games).toBe(0);
  });
});

describe('RLS en cuentas vinculadas', () => {
  const account = (
    userId: string,
    username: string,
    verified: boolean,
    platform: 'CHESSCOM' | 'LICHESS' = 'CHESSCOM',
  ) => ({
    id: randomUUID(),
    userId,
    platform,
    username,
    displayName: username,
    verifiedAt: verified ? new Date() : null,
  });

  it('cada uno escribe solo sus cuentas, y ve las de los miembros de su club', async () => {
    context = { userId: userA };
    await db.linkedAccount.create({
      data: account(userA, `a-${suffix}`, true),
    });
    await expect(
      db.linkedAccount.create({ data: account(userB, `b-${suffix}`, true) }),
    ).rejects.toThrow();

    await base.linkedAccount.create({
      data: account(userB, `b-${suffix}`, true),
    });
    // Desde el club A, B (que no es miembro) no se ve.
    context = { clubId: clubA, userId: userA };
    const seen = await db.linkedAccount.findMany();
    expect(seen.map((a) => a.userId)).toEqual([userA]);
  });

  it('una cuenta verificada es de una sola persona; los intentos sin verificar no bloquean', async () => {
    const name = `dup-${suffix}`;
    await base.linkedAccount.create({
      data: account(userA, name, false, 'LICHESS'),
    });
    await base.linkedAccount.create({
      data: account(userB, name, true, 'LICHESS'),
    });
    await expect(
      base.linkedAccount.update({
        where: { userId_platform: { userId: userA, platform: 'LICHESS' } },
        data: { username: name, verifiedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});

describe('RLS en roles', () => {
  it('en el club A solo se ven sus roles, y no se crean roles en el club B', async () => {
    context = { clubId: clubA, userId: userA };
    const rows = await db.clubRole.findMany();
    expect(new Set(rows.map((r) => r.clubId))).toEqual(new Set([clubA]));
    await expect(
      db.clubRole.create({
        data: { id: randomUUID(), clubId: clubB, name: 'X', position: 9 },
      }),
    ).rejects.toThrow();
  });

  it('fuera de un club, cada uno ve solo el rol que tiene en cada club', async () => {
    context = { userId: userA };
    const rows = await db.clubRole.findMany();
    expect(rows.map((r) => r.id)).toEqual([roles.ownerA]);
  });

  it('no se borra un rol que tiene miembros', async () => {
    await expect(
      base.clubRole.delete({ where: { id: roles.ownerA } }),
    ).rejects.toThrow();
  });
});
