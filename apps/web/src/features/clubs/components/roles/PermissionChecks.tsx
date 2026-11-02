'use client';
import type { Permission } from '@openchess/contracts';
import { PERMISSION_LABEL } from '../../model/permissions';

export function PermissionChecks({
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
