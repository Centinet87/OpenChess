'use client';
import type { Permission } from '@openchess/contracts';
import { useState, type FormEvent } from 'react';
import { DEFAULT_COLOR, type RoleInput } from '../../model/role-input';
import { PermissionChecks } from './PermissionChecks';

export function NewRole({
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
