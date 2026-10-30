import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createPrismaClient } from '@openchess/database';
import { AppModule } from '../app/app.module';
import { configureApp } from '../app/configure-app';
import { ACCESS_COOKIE } from '../identity/cookies';

config({ path: '../../.env', quiet: true });
const domain = process.env['APP_DOMAIN'] ?? 'localhost';

const base = createPrismaClient(process.env['DATABASE_URL'] ?? '');
const run = randomUUID().slice(0, 8);
const slugA = `a-${run}`;
const slugB = `b-${run}`;
const emails = ['ana', 'beto', 'caro'].map((n) => `${n}-${run}@test.local`);
let app: NestExpressApplication;

interface TestUser {
  id: string;
  cookie: string;
}
const users: Record<'ana' | 'beto' | 'caro', TestUser> = {} as never;

/** Request con la sesión del usuario y, si se indica, desde el subdominio de un club. */
function as(user: TestUser, slug?: string) {
  const host = slug ? `${slug}.${domain}` : domain;
  const agent = request(app.getHttpServer());
  const withAuth = (r: request.Test) =>
    r.set('Cookie', user.cookie).set('Host', host);
  return {
    get: (path: string) => withAuth(agent.get(`/api${path}`)),
    post: (path: string) => withAuth(agent.post(`/api${path}`)),
    patch: (path: string) => withAuth(agent.patch(`/api${path}`)),
    put: (path: string) => withAuth(agent.put(`/api${path}`)),
    delete: (path: string) => withAuth(agent.delete(`/api${path}`)),
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  for (const [i, name] of (['ana', 'beto', 'caro'] as const).entries()) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: emails[i], password: randomUUID(), displayName: name })
      .expect(201);
    const raw = res.headers['set-cookie'] as unknown as string[];
    const cookie =
      raw.find((c) => c.startsWith(`${ACCESS_COOKIE}=`))?.split(';')[0] ?? '';
    const user = await base.user.findUniqueOrThrow({
      where: { email: emails[i] },
    });
    users[name] = { id: user.id, cookie };
  }
});

afterAll(async () => {
  await base.club.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
  await base.user.deleteMany({ where: { email: { in: emails } } });
  await base.$disconnect();
  await app.close();
});

/** Ids de los roles del club A, por nombre. */
const rolesA: Record<string, string> = {};

describe('clubes', () => {
  let invitationToken: string;

  it('crear un club deja al creador como Admin, con los roles iniciales', async () => {
    await as(users.ana)
      .post('/clubs')
      .send({ slug: slugA, name: 'Club A' })
      .expect(201);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: slugB, name: 'Club B' })
      .expect(201);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: slugA, name: 'Copia' })
      .expect(409);
    await as(users.beto)
      .post('/clubs')
      .send({ slug: 'api', name: 'Reservado' })
      .expect(400);

    const mine = await as(users.ana).get('/clubs/mine').expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({
        slug: slugA,
        role: expect.objectContaining({ name: 'Admin', isOwner: true }),
      }),
    ]);

    const roles = await as(users.ana, slugA).get('/club/roles').expect(200);
    expect(roles.body.map((r: { name: string }) => r.name)).toEqual([
      'Admin',
      'Profesor',
      'Alumno',
    ]);
    for (const r of roles.body as { id: string; name: string }[]) {
      rolesA[r.name] = r.id;
    }
  });

  it('solo los miembros ven el club, y un subdominio inexistente da 404', async () => {
    const res = await as(users.ana, slugA).get('/club/members').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        userId: users.ana.id,
        role: expect.objectContaining({ name: 'Admin' }),
        displayName: 'ana',
      }),
    ]);

    await as(users.ana, slugB).get('/club/members').expect(403);
    await as(users.ana, `nada-${run}`).get('/club/members').expect(404);
  });

  it('un X-Forwarded-Host inventado no da acceso a otro club', async () => {
    await as(users.ana, slugA)
      .get('/club/members')
      .set('X-Forwarded-Host', `${slugB}.localhost`)
      .expect(403);
  });

  it('un token de invitación del club A no sirve en el club B', async () => {
    const res = await as(users.ana, slugA)
      .post('/club/invitations')
      .send({ roleId: rolesA['Profesor'] })
      .expect(201);
    invitationToken = res.body.token;

    await as(users.caro, slugB)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(404);
  });

  it('la invitación se acepta una sola vez', async () => {
    const res = await as(users.caro, slugA)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(200);
    expect(res.body.role).toMatchObject({ name: 'Profesor' });

    await as(users.beto, slugA)
      .post('/club/invitations/accept')
      .send({ token: invitationToken })
      .expect(409);
  });

  it('un Profesor invita alumnos pero no profesores, ni cambia roles ni crea roles', async () => {
    await as(users.caro, slugA)
      .post('/club/invitations')
      .send({ roleId: rolesA['Alumno'] })
      .expect(201);
    await as(users.caro, slugA)
      .post('/club/invitations')
      .send({ roleId: rolesA['Profesor'] })
      .expect(403);
    await as(users.caro, slugA)
      .patch(`/club/members/${users.ana.id}`)
      .send({ roleId: rolesA['Alumno'] })
      .expect(403);
    await as(users.caro, slugA)
      .post('/club/roles')
      .send({ name: 'Jefe', permissions: ['MANAGE_ROLES'] })
      .expect(403);

    const me = await as(users.caro, slugA).get('/club/me').expect(200);
    expect(me.body).toMatchObject({
      name: 'Profesor',
      isOwner: false,
      permissions: ['INVITE_MEMBERS', 'PLAY_GAMES', 'IMPORT_GAMES'],
    });
  });

  it('el admin crea un rango "Miembro del club", lo ordena en la jerarquía y se lo asigna a alguien', async () => {
    const created = await as(users.ana, slugA)
      .post('/club/roles')
      .send({
        name: 'Miembro del club',
        color: '#27AE60',
        permissions: ['PLAY_GAMES'],
      })
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Miembro del club',
      color: '#27ae60',
      position: 3,
      permissions: ['PLAY_GAMES'],
    });
    rolesA['Miembro del club'] = created.body.id;

    const ordered = await as(users.ana, slugA)
      .put('/club/roles/order')
      .send({
        roleIds: [
          rolesA['Profesor'],
          rolesA['Miembro del club'],
          rolesA['Alumno'],
        ],
      })
      .expect(200);
    expect(ordered.body.map((r: { name: string }) => r.name)).toEqual([
      'Admin',
      'Profesor',
      'Miembro del club',
      'Alumno',
    ]);

    await as(users.ana, slugA)
      .patch(`/club/members/${users.caro.id}`)
      .send({ roleId: rolesA['Miembro del club'] })
      .expect(204);
    const members = await as(users.ana, slugA).get('/club/members').expect(200);
    expect(
      members.body.map((m: { role: { name: string } }) => m.role.name),
    ).toEqual(['Admin', 'Miembro del club']);

    // Ese rol ya no puede invitar.
    await as(users.caro, slugA)
      .post('/club/invitations')
      .send({ roleId: rolesA['Alumno'] })
      .expect(403);
  });

  it('un rol con miembros no se borra; uno sin miembros sí', async () => {
    const inUse = await as(users.ana, slugA)
      .delete(`/club/roles/${rolesA['Miembro del club']}`)
      .expect(409);
    expect(inUse.body.code).toBe('ROLE_IN_USE');
    await as(users.ana, slugA)
      .delete(`/club/roles/${rolesA['Profesor']}`)
      .expect(204);
    // El dueño no se borra nunca.
    await as(users.ana, slugA)
      .delete(`/club/roles/${rolesA['Admin']}`)
      .expect(400);
  });

  it('un rol sin permiso de jugar no desafía ni puede ser desafiado', async () => {
    const apoderado = await as(users.ana, slugA)
      .post('/club/roles')
      .send({ name: 'Apoderado', permissions: [] })
      .expect(201);
    await as(users.ana, slugA)
      .patch(`/club/members/${users.caro.id}`)
      .send({ roleId: apoderado.body.id })
      .expect(204);

    await as(users.caro, slugA)
      .post('/club/games')
      .send({ opponentId: users.ana.id, timeControl: '5+0' })
      .expect(403);
    const res = await as(users.ana, slugA)
      .post('/club/games')
      .send({ opponentId: users.caro.id, timeControl: '5+0' })
      .expect(422);
    expect(res.body.code).toBe('OPPONENT_NOT_MEMBER');
  });

  it('el club no se queda sin dueño', async () => {
    await as(users.ana, slugA)
      .patch(`/club/members/${users.ana.id}`)
      .send({ roleId: rolesA['Alumno'] })
      .expect(409);
  });

  it('el dueño de otro club no puede sacar miembros de este', async () => {
    await as(users.beto, slugA)
      .delete(`/club/members/${users.caro.id}`)
      .expect(403);
  });

  it('el admin saca a un miembro', async () => {
    await as(users.ana, slugA)
      .delete(`/club/members/${users.caro.id}`)
      .expect(204);
    const res = await as(users.ana, slugA).get('/club/members').expect(200);
    expect(res.body.map((m: { userId: string }) => m.userId)).toEqual([
      users.ana.id,
    ]);
  });
});
