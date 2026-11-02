'use client';
import { clubsApi } from '../../api/clubs.api';

import type { Permission, RoleView } from '@openchess/contracts';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../../../shared/api/client';
import { PERMISSION_LABEL } from '../../model/permissions';
import { NewRole } from './NewRole';
import { RoleEditor } from './RoleEditor';
import { RoleTag } from './RoleTag';

type Props = {
  myRole: RoleView;
};

/**
 * Roles del club, de arriba abajo. Solo se editan los que están por debajo del
 * propio, y no se puede dar un permiso que uno no tiene (la API lo valida igual).
 */
export function RolesAdmin({ myRole }: Props) {
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const grantable = permissions.filter((p) => myRole.permissions.includes(p));

  const load = useCallback(() => {
    clubsApi.roles().then(({ data }) => setRoles(data));
  }, []);

  useEffect(() => {
    load();
    clubsApi.permissions().then(({ data }) => setPermissions(data));
  }, [load]);

  const act = async (request: () => Promise<unknown>) => {
    setError(null);
    try {
      await request();
      load();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  // Reordenar: la API recibe todos los roles menos el dueño, de arriba abajo.
  const ordered = roles.filter((r) => !r.isOwner);
  const move = (index: number, delta: -1 | 1) => {
    const next = [...ordered];
    const [role] = next.splice(index, 1);
    next.splice(index + delta, 0, role);
    void act(() => clubsApi.reorderRoles({ roleIds: next.map((r) => r.id) }));
  };

  return (
    <div className="stack">
      <section className="card" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <p className="muted mt-0">
          De arriba abajo. Puedes editar los que están por debajo del tuyo.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <ul className="list">
          {roles.map((role) => {
            const index = ordered.findIndex((r) => r.id === role.id);
            const isEditable = role.position > myRole.position;
            return (
              <li key={role.id} className="role-item">
                <div className="role-head">
                  <RoleTag role={role} />
                  {myRole.isOwner && !role.isOwner && (
                    <span className="admin-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Subir ${role.name}`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label={`Bajar ${role.name}`}
                        disabled={index === ordered.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </div>
                {isEditable ? (
                  <RoleEditor
                    role={role}
                    grantable={grantable}
                    onSave={(changes) =>
                      act(() => clubsApi.updateRole(role.id, changes))
                    }
                    onDelete={() => act(() => clubsApi.deleteRole(role.id))}
                  />
                ) : (
                  <p className="muted role-perms">
                    {role.isOwner
                      ? 'Todos los permisos.'
                      : role.permissions
                          .map((p) => PERMISSION_LABEL[p])
                          .join(', ') || 'Sin permisos.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <NewRole
        grantable={grantable}
        onCreate={(input) => act(() => clubsApi.createRole(input))}
      />
    </div>
  );
}
