'use client';
import { clubsApi } from '../api/clubs.api';

import type { MyClubView } from '@openchess/contracts';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { rootUrl } from '../../../shared/lib/host';
import { AuthScreen } from '../../auth/components/AuthScreen';
import { Topbar } from '../../auth/components/Topbar';
import { useMe } from '../../auth/hooks/use-me';
import { ClubHome } from '../components/ClubHome';

/** Portada del club en su subdominio: partidas, desafiar, miembros e invitaciones. */
export default function ClubPage() {
  const { slug } = useParams<{ slug: string }>();
  const session = useMe();
  const [club, setClub] = useState<MyClubView | null | undefined>(undefined);

  useEffect(() => {
    if (session.status !== 'ready') return;
    clubsApi
      .mine()
      .then(({ data }) => setClub(data.find((c) => c.slug === slug) ?? null))
      .catch(() => setClub(null));
  }, [session.status, slug]);

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen onSuccess={session.reload} title="Entra a tu club." />
      </main>
    );
  }
  if (club === undefined) return <main className="shell" aria-busy="true" />;
  if (club === null) {
    return (
      <main className="shell">
        <Topbar me={session.me} />
        <h1 className="page-title">No eres miembro de este club</h1>
        <p className="lead">
          Pídele un link de invitación a un dueño o profesor del club.{' '}
          <a href={rootUrl('/')}>Volver a tus clubes</a>
        </p>
      </main>
    );
  }

  return <ClubHome me={session.me} club={club} />;
}
