import { ClubError } from '../errors';
import { defaultRoles, hasPermission, type ClubRole } from './role';
import { RoleBook } from './role-book';
import { Roster } from './roster';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ClubError ? e.code : 'OTHER';
  }
  return undefined;
}

/** Admin (dueño), Profesor, Alumno y un Monitor que gestiona roles por debajo. */
function setup() {
  let n = 0;
  const [admin, profesor, alumno] = defaultRoles('club', () => `r${++n}`);
  const monitor: ClubRole = {
    id: 'monitor',
    clubId: 'club',
    name: 'Monitor',
    color: null,
    position: 1,
    isOwner: false,
    permissions: [
      'MANAGE_ROLES',
      'INVITE_MEMBERS',
      'REMOVE_MEMBERS',
      'PLAY_GAMES',
    ],
  };
  const roles = RoleBook.of([
    admin,
    monitor,
    { ...profesor, position: 2 },
    { ...alumno, position: 3 },
  ]);
  const roster = Roster.of(
    [
      { userId: 'ana', roleId: admin.id },
      { userId: 'mono', roleId: monitor.id },
      { userId: 'pepe', roleId: profesor.id },
      { userId: 'alu', roleId: alumno.id },
    ],
    roles,
  );
  return { roles, roster, admin, monitor, profesor, alumno };
}

describe('roles iniciales', () => {
  it('Admin es dueño con todo; Profesor invita; Alumno juega', () => {
    const [admin, profesor, alumno] = defaultRoles('c', () => 'x');
    expect(admin).toMatchObject({ name: 'Admin', isOwner: true, position: 0 });
    expect(hasPermission(admin, 'MANAGE_FIDE')).toBe(true);
    expect(hasPermission(profesor, 'INVITE_MEMBERS')).toBe(true);
    expect(hasPermission(profesor, 'MANAGE_ROLES')).toBe(false);
    expect(hasPermission(alumno, 'PLAY_GAMES')).toBe(true);
    expect(hasPermission(alumno, 'INVITE_MEMBERS')).toBe(false);
  });
});

describe('RoleBook', () => {
  it('crea un rol con nombre, color y permisos, al final de la jerarquía', () => {
    const { roles, admin } = setup();
    const { role } = roles.create(
      admin,
      {
        name: '  Socio   fundador ',
        color: '#1E90FF',
        permissions: ['PLAY_GAMES', 'IMPORT_GAMES', 'PLAY_GAMES'],
      },
      'socio',
    );
    expect(role).toMatchObject({
      name: 'Socio fundador',
      color: '#1e90ff',
      position: 4,
      isOwner: false,
      permissions: ['PLAY_GAMES', 'IMPORT_GAMES'],
    });
  });

  it('valida nombre, color, permisos y que el nombre no se repita', () => {
    const { roles, admin } = setup();
    const create = (
      name: string,
      color: string | null,
      permissions: string[],
    ) => code(() => roles.create(admin, { name, color, permissions }, 'x'));
    expect(create('', null, [])).toBe('INVALID_ROLE');
    expect(create('Socio', 'azul', [])).toBe('INVALID_ROLE');
    expect(create('Socio', null, ['VOLAR'])).toBe('INVALID_ROLE');
    expect(create('alumno', null, [])).toBe('INVALID_ROLE');
  });

  it('nadie da un permiso que no tiene ni toca roles a su nivel o por encima', () => {
    const { roles, monitor, profesor, admin } = setup();
    // El Monitor no tiene MANAGE_FIDE: no puede darlo.
    expect(
      code(() =>
        roles.create(monitor, { name: 'X', permissions: ['MANAGE_FIDE'] }, 'x'),
      ),
    ).toBe('FORBIDDEN');
    // Puede editar un rol por debajo, con permisos que sí tiene.
    expect(
      roles.update(monitor, profesor.id, { permissions: ['INVITE_MEMBERS'] })
        .role.permissions,
    ).toEqual(['INVITE_MEMBERS']);
    // Pero no su propio rol, ni el del dueño.
    expect(
      code(() => roles.update(monitor, monitor.id, { name: 'Jefe' })),
    ).toBe('FORBIDDEN');
    expect(code(() => roles.update(monitor, admin.id, { name: 'X' }))).toBe(
      'FORBIDDEN',
    );
  });

  it('el rol dueño se puede renombrar, pero no quitarle permisos ni borrarlo', () => {
    const { roles, admin } = setup();
    expect(
      roles.update(admin, admin.id, { name: 'Presidente' }).role.name,
    ).toBe('Presidente');
    expect(
      code(() =>
        roles.update(admin, admin.id, { permissions: ['PLAY_GAMES'] }),
      ),
    ).toBe('INVALID_ROLE');
    expect(code(() => roles.remove(admin, admin.id, false))).toBe(
      'INVALID_ROLE',
    );
  });

  it('no se borra un rol que alguien tiene; al borrar, las posiciones no quedan con huecos', () => {
    const { roles, admin, profesor } = setup();
    expect(code(() => roles.remove(admin, profesor.id, true))).toBe(
      'ROLE_IN_USE',
    );
    const after = roles.remove(admin, profesor.id, false);
    expect(after.all.map((r) => [r.name, r.position])).toEqual([
      ['Admin', 0],
      ['Monitor', 1],
      ['Alumno', 2],
    ]);
  });

  it('solo un dueño reordena, y el rol dueño queda siempre arriba', () => {
    const { roles, admin, monitor, profesor, alumno } = setup();
    const ids = [alumno.id, profesor.id, monitor.id];
    expect(code(() => roles.reorder(monitor, ids))).toBe('FORBIDDEN');
    expect(code(() => roles.reorder(admin, [alumno.id]))).toBe('INVALID_ROLE');
    expect(roles.reorder(admin, ids).all.map((r) => r.name)).toEqual([
      'Admin',
      'Alumno',
      'Profesor',
      'Monitor',
    ]);
  });
});

describe('Roster', () => {
  it('invitar exige el permiso y un rol por debajo del propio', () => {
    const { roster, admin, monitor, profesor, alumno } = setup();
    expect(roster.assertCanInvite('pepe', alumno.id).name).toBe('Alumno');
    expect(code(() => roster.assertCanInvite('pepe', profesor.id))).toBe(
      'FORBIDDEN',
    );
    expect(code(() => roster.assertCanInvite('alu', alumno.id))).toBe(
      'FORBIDDEN',
    );
    expect(code(() => roster.assertCanInvite('mono', admin.id))).toBe(
      'FORBIDDEN',
    );
    expect(roster.assertCanInvite('ana', admin.id).isOwner).toBe(true);
    expect(code(() => roster.assertCanInvite('mono', monitor.id))).toBe(
      'FORBIDDEN',
    );
  });

  it('cambiar el rol de alguien exige MANAGE_ROLES y estar por encima de ambos roles', () => {
    const { roster, admin, profesor, alumno } = setup();
    expect(
      roster.changeRole('mono', 'alu', profesor.id).find('alu')?.roleId,
    ).toBe(profesor.id);
    expect(code(() => roster.changeRole('mono', 'alu', admin.id))).toBe(
      'FORBIDDEN',
    );
    expect(code(() => roster.changeRole('pepe', 'alu', alumno.id))).toBe(
      'FORBIDDEN',
    );
    expect(code(() => roster.changeRole('mono', 'mono', alumno.id))).toBe(
      'FORBIDDEN',
    );
  });

  it('el club no se queda sin dueño; con dos, uno puede bajarse', () => {
    const { roster, admin, alumno } = setup();
    expect(code(() => roster.changeRole('ana', 'ana', alumno.id))).toBe(
      'LAST_OWNER',
    );
    expect(code(() => roster.remove('ana', 'ana'))).toBe('LAST_OWNER');
    const two = roster.changeRole('ana', 'mono', admin.id);
    expect(two.changeRole('ana', 'ana', alumno.id).find('ana')?.roleId).toBe(
      alumno.id,
    );
  });

  it('sacar a alguien exige REMOVE_MEMBERS y estar por encima; salirse lo puede cualquiera', () => {
    const { roster } = setup();
    expect(roster.remove('mono', 'alu').find('alu')).toBeUndefined();
    expect(code(() => roster.remove('mono', 'ana'))).toBe('FORBIDDEN');
    expect(code(() => roster.remove('pepe', 'alu'))).toBe('FORBIDDEN');
    expect(roster.remove('alu', 'alu').find('alu')).toBeUndefined();
  });

  it('no muta el roster original', () => {
    const { roster, profesor, alumno } = setup();
    roster.changeRole('ana', 'alu', profesor.id);
    expect(roster.find('alu')?.roleId).toBe(alumno.id);
  });
});
