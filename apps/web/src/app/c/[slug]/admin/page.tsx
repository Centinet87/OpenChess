'use client';

import { useEffect, useState } from 'react';
import { canAdminister } from '../../../../components/admin/labels';
import { FideAdmin } from '../../../../components/admin/FideAdmin';
import { MembersAdmin } from '../../../../components/admin/MembersAdmin';
import { PlanAdmin } from '../../../../components/admin/PlanAdmin';
import { RolesAdmin } from '../../../../components/admin/RolesAdmin';
import { AuthScreen } from '../../../../components/AuthScreen';
import { Topbar } from '../../../../components/Topbar';
import { api, type Profile, type RoleView } from '../../../../lib/api';
import { useMe } from '../../../../lib/use-me';

type Tab = 'members' | 'roles' | 'fide' | 'plan';

/** Panel de administración del club: cada pestaña aparece según los permisos. */
export default function AdminPage() {
  const session = useMe();
  const [myRole, setMyRole] = useState<RoleView | null | undefined>(undefined);

  useEffect(() => {
    if (session.status !== 'ready') return;
    api
      .get<RoleView>('/club/me')
      .then(({ data }) => setMyRole(data))
      .catch(() => setMyRole(null));
  }, [session.status]);

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen onSuccess={session.reload} title="Administra tu club." />
      </main>
    );
  }
  if (myRole === undefined) return <main className="shell" aria-busy="true" />;
  if (myRole === null || !canAdminister(myRole)) {
    return (
      <main className="shell">
        <Topbar me={session.me} />
        <h1 className="page-title">Sin acceso al panel</h1>
        <p className="lead">
          Tu rol en este club no tiene permisos de administración.{' '}
          <a href="/">Volver al club</a>
        </p>
      </main>
    );
  }
  return <AdminPanel me={session.me} myRole={myRole} />;
}

function AdminPanel({ me, myRole }: { me: Profile; myRole: RoleView }) {
  const has = (p: RoleView['permissions'][number]) =>
    myRole.permissions.includes(p);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'members', label: 'Miembros' },
    ...(has('MANAGE_ROLES') ? [{ id: 'roles' as const, label: 'Roles' }] : []),
    ...(has('MANAGE_FIDE') ? [{ id: 'fide' as const, label: 'Elo FIDE' }] : []),
    { id: 'plan', label: 'Plan' },
  ];
  const [tab, setTab] = useState<Tab>('members');

  return (
    <main className="shell">
      <Topbar me={me} />
      <p className="eyebrow">Administración · {myRole.name}</p>
      <h1 className="page-title">Panel del club</h1>
      <p style={{ marginTop: 0 }}>
        <a href="/">← Volver al club</a>
      </p>

      <div className="tabs" role="tablist" aria-label="Secciones del panel">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="admin-panel"
      >
        {tab === 'members' && <MembersAdmin myRole={myRole} meId={me.id} />}
        {tab === 'roles' && <RolesAdmin myRole={myRole} />}
        {tab === 'fide' && <FideAdmin canManage={has('MANAGE_FIDE')} />}
        {tab === 'plan' && <PlanAdmin isOwner={myRole.isOwner} />}
      </div>
    </main>
  );
}
