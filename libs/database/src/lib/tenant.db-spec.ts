import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createPrismaClient } from './database.js';
import { withTenantContext, type TenantContext } from './tenant.js';

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

  await base.membership.createMany({
    data: [
      { clubId: clubA, userId: userA, role: 'OWNER' },
      { clubId: clubB, userId: userB, role: 'OWNER' },
    ],
  });
  const expiresAt = new Date(Date.now() + 60_000);
  await base.invitation.createMany({
    data: [
      {
        clubId: clubA,
        tokenHash: `a-${suffix}`,
        role: 'STUDENT',
        createdById: userA,
        expiresAt,
      },
      {
        clubId: clubB,
        tokenHash: `b-${suffix}`,
        role: 'STUDENT',
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
  it('mantiene el rol y el aislamiento dentro de una transacción compuesta', async () => {
    context = { clubId: clubA, userId: userA };
    await db.$tenantTransaction(async (tx) => {
      const roles = await tx.$queryRaw<
        Array<{ role: string }>
      >`SELECT current_user AS role`;
      expect(roles[0].role).toBe('app_user');
      const rows = await tx.invitation.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].clubId).toBe(clubA);
    });
    context = {};
    const rows = await db.$tenantTransaction((tx) => tx.invitation.findMany());
    expect(rows).toHaveLength(0);
  });

  it('rechaza escrituras de otro club en una transacción compuesta', async () => {
    context = { clubId: clubA, userId: userA };
    await expect(
      db.$tenantTransaction((tx) =>
        tx.membership.create({
          data: { clubId: clubB, userId: userA, role: 'OWNER' },
        }),
      ),
    ).rejects.toThrow();
  });

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
        data: { clubId: clubB, userId: userA, role: 'OWNER' },
      }),
    ).rejects.toThrow();
  });

  it('desde el club A no se puede modificar ni borrar el club B', async () => {
    context = { clubId: clubA, userId: userA };
    const updated = await db.invitation.updateMany({
      where: { clubId: clubB },
      data: { role: 'OWNER' },
    });
    const deleted = await db.membership.deleteMany({
      where: { clubId: clubB },
    });
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
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
