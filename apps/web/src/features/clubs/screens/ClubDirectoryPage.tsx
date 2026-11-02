'use client';
import { AuthScreen } from '../../auth/components/AuthScreen';
import { Topbar } from '../../auth/components/Topbar';
import { useMe } from '../../auth/hooks/use-me';
import { ClubList } from '../components/directory/ClubList';
import { CreateClub } from '../components/directory/CreateClub';

/** Dominio raíz: acceso, mis clubes y crear un club. */
export default function HomePage() {
  const session = useMe();

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen onSuccess={session.reload} />
      </main>
    );
  }

  return (
    <main className="shell">
      <Topbar me={session.me} />
      <p className="eyebrow">Hola, {session.me.displayName}</p>
      <h1 className="page-title">Tus clubes</h1>
      <div className="grid-2 mt-(--space-8)">
        <ClubList />
        <CreateClub />
      </div>
    </main>
  );
}
