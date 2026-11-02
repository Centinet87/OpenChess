'use client';
import type { Permission, RoleView } from '@openchess/contracts';
import { useState } from 'react';
import { DEFAULT_COLOR, type RoleInput } from '../../model/role-input';
import { PermissionChecks } from './PermissionChecks';

export function RoleEditor({
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
