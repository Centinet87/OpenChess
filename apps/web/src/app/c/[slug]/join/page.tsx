'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthScreen } from '../../../../components/AuthScreen';
import { Topbar } from '../../../../components/Topbar';
import { api, errorMessage } from '../../../../lib/api';
import { useMe } from '../../../../lib/use-me';

/** Link de invitación: pide sesión si hace falta y une al club. */
export default function JoinPage() {
  return (
    <Suspense fallback={<main className="shell" aria-busy="true" />}>
      <Join />
    </Suspense>
  );
}

function Join() {
  const token = useSearchParams().get('token');
  const session = useMe();
  const [error, setError] = useState<string | null>(null);
  const isSent = useRef(false);

  useEffect(() => {
    if (session.status !== 'ready' || !token || isSent.current) return;
    isSent.current = true;
    api
      .post('/club/invitations/accept', { token })
      .then(() => window.location.replace('/'))
      .catch((e) => setError(errorMessage(e)));
  }, [session.status, token]);

  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen
          onSuccess={session.reload}
          title="Te invitaron a un club."
        />
      </main>
    );
  }

  return (
    <main className="shell">
      <Topbar me={session.status === 'ready' ? session.me : undefined} />
      {!token && (
        <p className="error">El link de invitación está incompleto.</p>
      )}
      {error ? (
        <>
          <h1 className="page-title">No pudimos unirte</h1>
          <p className="error" role="alert">
            {error}
          </p>
          <p>
            <a href="/">Ir al club</a>
          </p>
        </>
      ) : (
        token && <p className="lead">Uniéndote al club…</p>
      )}
    </main>
  );
}
