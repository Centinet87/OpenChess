'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  errorMessage,
  type MemberView,
  type RoleView,
} from '../../lib/api';
import { RoleTag } from '../RoleTag';

type Props = {
  myRole: RoleView;
  meId: string;
};

/** Cambiar el rol y sacar miembros, solo a quienes están por debajo del propio rol. */
export function MembersAdmin({ myRole, meId }: Props) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const canChangeRoles = myRole.permissions.includes('MANAGE_ROLES');
  const canRemove = myRole.permissions.includes('REMOVE_MEMBERS');
  // 0 es el rol más alto: solo se gestiona a quien está por debajo.
  const isBelowMe = (position: number) => position > myRole.position;
  const assignable = roles.filter((r) => isBelowMe(r.position));

  const load = useCallback(() => {
    api.get<MemberView[]>('/club/members').then(({ data }) => setMembers(data));
    api.get<RoleView[]>('/club/roles').then(({ data }) => setRoles(data));
  }, []);

  useEffect(load, [load]);

  const act = async (request: () => Promise<unknown>) => {
    setError(null);
    try {
      await request();
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="card" aria-labelledby="members-admin-title">
      <h2 id="members-admin-title">Miembros</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="list">
        {members.map((m) => {
          const isManageable = m.userId !== meId && isBelowMe(m.role.position);
          return (
            <li key={m.userId} className="admin-row">
              <span>
                {m.displayName}
                {m.userId === meId && <span className="muted"> (tú)</span>}
              </span>
              <div className="admin-row-actions">
                {isManageable && canChangeRoles ? (
                  <select
                    aria-label={`Rol de ${m.displayName}`}
                    value={m.role.id}
                    onChange={(e) =>
                      act(() =>
                        api.patch(`/club/members/${m.userId}`, {
                          roleId: e.target.value,
                        }),
                      )
                    }
                  >
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <RoleTag role={m.role} />
                )}
                {isManageable && canRemove && confirmingRemove !== m.userId && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmingRemove(m.userId)}
                  >
                    Sacar
                  </button>
                )}
                {confirmingRemove === m.userId && (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setConfirmingRemove(null);
                        void act(() => api.delete(`/club/members/${m.userId}`));
                      }}
                    >
                      Sí, sacar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmingRemove(null)}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
