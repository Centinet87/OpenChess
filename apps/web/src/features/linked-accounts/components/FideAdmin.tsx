'use client';
import { clubsApi } from '../../clubs/api/clubs.api';
import { fideApi } from '../api/fide.api';

import type { FideView, MemberView } from '@openchess/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../shared/api/client';

/** Elo FIDE de los miembros. Lo asigna quien tiene MANAGE_FIDE; vale solo en este club. */
export function FideAdmin({ canManage }: { canManage: boolean }) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [fide, setFide] = useState<Record<string, FideView>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    clubsApi.members().then(({ data }) => setMembers(data));
    fideApi
      .list()
      .then(({ data }) =>
        setFide(Object.fromEntries(data.map((f) => [f.userId, f]))),
      );
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

  const handleAssign =
    (userId: string) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const fideId = String(
        new FormData(event.currentTarget).get('fideId'),
      ).trim();
      void act(() => fideApi.assign(userId, { fideId }));
    };

  return (
    <section className="card" aria-labelledby="fide-title">
      <h2 id="fide-title">Elo FIDE</h2>
      <p className="muted mt-0">
        Se lee de la ficha pública de ratings.fide.com. Quien tiene Elo FIDE
        parte con ese rating en el ranking del club.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="list">
        {members.map((m) => {
          const f = fide[m.userId];
          return (
            <li key={m.userId} className="admin-row">
              <div>
                <strong>{m.displayName}</strong>
                <div className="muted text-[0.875rem]">
                  {f ? (
                    <>
                      {f.title && `${f.title} · `}
                      {f.name} · {f.federation ?? '—'} · Estándar{' '}
                      {f.ratings.standard ?? '—'} ·{' '}
                      <a href={f.url} target="_blank" rel="noopener noreferrer">
                        {f.fideId}
                      </a>
                    </>
                  ) : (
                    'Sin FIDE ID'
                  )}
                </div>
              </div>
              {canManage && (
                <div className="admin-row-actions">
                  {f ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => act(() => fideApi.refresh(m.userId))}
                      >
                        Actualizar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => act(() => fideApi.remove(m.userId))}
                      >
                        Quitar
                      </button>
                    </>
                  ) : (
                    <form
                      className="inline-form"
                      onSubmit={handleAssign(m.userId)}
                    >
                      <input
                        name="fideId"
                        inputMode="numeric"
                        pattern="[0-9]{4,12}"
                        placeholder="FIDE ID"
                        aria-label={`FIDE ID de ${m.displayName}`}
                        required
                      />
                      <button type="submit" className="btn btn-sm">
                        Asignar
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
