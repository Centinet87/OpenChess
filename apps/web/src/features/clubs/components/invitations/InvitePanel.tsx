'use client';
import { clubsApi } from '../../api/clubs.api';

import type { RoleView } from '@openchess/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../../shared/api/client';
import { clubUrl } from '../../../../shared/lib/host';

export function InvitePanel({
  myRole,
  slug,
}: {
  myRole: RoleView;
  slug: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [roles, setRoles] = useState<RoleView[]>([]);

  useEffect(() => {
    // Solo se puede invitar con un rol por debajo del propio (0 es el más alto).
    clubsApi
      .roles()
      .then(({ data }) =>
        setRoles(data.filter((r) => r.position > myRole.position)),
      );
  }, [myRole.position]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setIsCopied(false);
    try {
      const { data } = await clubsApi.invite({
        roleId: String(form.get('roleId') ?? ''),
      });
      setLink(clubUrl(slug, `/join?token=${encodeURIComponent(data.token)}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setIsCopied(true);
  };

  return (
    <section className="card" aria-labelledby="invite-title">
      <h2 id="invite-title">Invitar</h2>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="roleId">Como</label>
          <select id="roleId" name="roleId" required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="field-hint">
            El link sirve una vez y vence en 7 días.
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn">
          Generar link
        </button>
      </form>
      {link && (
        <div className="code-box mt-(--space-4)">
          <span className="flex-1">{link}</span>
          <button type="button" className="btn btn-sm" onClick={handleCopy}>
            {isCopied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
    </section>
  );
}
