'use client';
import { clubsApi } from '../../api/clubs.api';

import type { MyClubView } from '@openchess/contracts';
import { useEffect, useState } from 'react';
import { clubUrl } from '../../../../shared/lib/host';
import { RoleTag } from '../roles/RoleTag';

export function ClubList() {
  const [clubs, setClubs] = useState<MyClubView[] | null>(null);

  useEffect(() => {
    clubsApi
      .mine()
      .then(({ data }) => setClubs(data))
      .catch(() => setClubs([]));
  }, []);

  return (
    <section className="card" aria-labelledby="clubs-title">
      <h2 id="clubs-title">Miembro de</h2>
      {clubs === null && <p className="muted">Cargando…</p>}
      {clubs?.length === 0 && (
        <p className="empty">
          Todavía no estás en ningún club. Crea uno o pide un link de
          invitación.
        </p>
      )}
      <ul className="list">
        {clubs?.map((club) => (
          <li key={club.id}>
            <a className="club-link" href={clubUrl(club.slug)}>
              <strong>{club.name}</strong>
              <span className="muted">{club.slug}</span>
            </a>
            <RoleTag role={club.role} />
          </li>
        ))}
      </ul>
    </section>
  );
}
