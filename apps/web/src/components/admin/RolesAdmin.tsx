'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  api,
  errorMessage,
  type Permission,
  type RoleView,
} from '../../lib/api';
import { RoleTag } from '../RoleTag';
import { PERMISSION_LABEL } from './labels';

const DEFAULT_COLOR = '#5c554b';

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
    api.get<RoleView[]>('/club/roles').then(({ data }) => setRoles(data));
  }, []);

  useEffect(() => {
    load();
    api
      .get<Permission[]>('/club/roles/permissions')
      .then(({ data }) => setPermissions(data));
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
    void act(() =>
      api.put('/club/roles/order', { roleIds: next.map((r) => r.id) }),
    );
  };

  return (
    <div className="stack">
      <section className="card" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <p className="muted" style={{ marginTop: 0 }}>
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
                      act(() => api.patch(`/club/roles/${role.id}`, changes))
                    }
                    onDelete={() =>
                      act(() => api.delete(`/club/roles/${role.id}`))
                    }
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
        onCreate={(input) => act(() => api.post('/club/roles', input))}
      />
    </div>
  );
}

type RoleInput = { name: string; color: string; permissions: Permission[] };

function PermissionChecks({
  grantable,
  selected,
  onChange,
  idPrefix,
}: {
  grantable: Permission[];
  selected: Permission[];
  onChange: (next: Permission[]) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="perm-grid">
      <legend className="field-hint">Permisos</legend>
      {grantable.map((p) => (
        <label key={p} htmlFor={`${idPrefix}-${p}`} className="perm-check">
          <input
            id={`${idPrefix}-${p}`}
            type="checkbox"
            checked={selected.includes(p)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, p]
                  : selected.filter((x) => x !== p),
              )
            }
          />
          {PERMISSION_LABEL[p]}
        </label>
      ))}
    </fieldset>
  );
}

function RoleEditor({
  role,
  grantable,
  onSave,
  onDelete,
}: {
  role: RoleView;
  grantable: Permission[];
  onSave: (changes: RoleInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? DEFAULT_COLOR);
  const [selected, setSelected] = useState<Permission[]>([...role.permissions]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isDirty =
    name !== role.name ||
    color !== (role.color ?? DEFAULT_COLOR) ||
    selected.length !== role.permissions.length ||
    selected.some((p) => !role.permissions.includes(p));

  return (
    <div className="role-editor">
      <div className="form-row">
        <div className="field">
          <label htmlFor={`name-${role.id}`}>Nombre</label>
          <input
            id={`name-${role.id}`}
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field color-field">
          <label htmlFor={`color-${role.id}`}>Color</label>
          <input
            id={`color-${role.id}`}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>
      <PermissionChecks
        grantable={grantable}
        selected={selected}
        onChange={setSelected}
        idPrefix={role.id}
      />
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!isDirty || !name.trim()}
          onClick={() =>
            onSave({ name: name.trim(), color, permissions: selected })
          }
        >
          Guardar
        </button>
        {isConfirmingDelete ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                setIsConfirmingDelete(false);
                void onDelete();
              }}
            >
              Sí, borrar
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIsConfirmingDelete(false)}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIsConfirmingDelete(true)}
          >
            Borrar rol
          </button>
        )}
      </div>
    </div>
  );
}

function NewRole({
  grantable,
  onCreate,
}: {
  grantable: Permission[];
  onCreate: (input: RoleInput) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Permission[]>(['PLAY_GAMES']);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await onCreate({
      name: String(data.get('name')).trim(),
      color: String(data.get('color')),
      permissions: selected.filter((p) => grantable.includes(p)),
    });
    if (ok) {
      form.reset();
      setSelected(['PLAY_GAMES']);
    }
  };

  return (
    <section className="card" aria-labelledby="new-role-title">
      <h2 id="new-role-title">Nuevo rol</h2>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="new-role-name">Nombre</label>
            <input id="new-role-name" name="name" required maxLength={100} />
          </div>
          <div className="field color-field">
            <label htmlFor="new-role-color">Color</label>
            <input
              id="new-role-color"
              name="color"
              type="color"
              defaultValue={DEFAULT_COLOR}
            />
          </div>
        </div>
        <PermissionChecks
          grantable={grantable}
          selected={selected}
          onChange={setSelected}
          idPrefix="new"
        />
        <span className="field-hint">Queda al final de la jerarquía.</span>
        <button type="submit" className="btn btn-primary">
          Crear rol
        </button>
      </form>
    </section>
  );
}
