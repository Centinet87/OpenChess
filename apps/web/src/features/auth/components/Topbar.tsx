'use client';
import { authApi } from '../api/auth.api';

import type { Profile } from '@openchess/contracts';
import { rootUrl } from '../../../shared/lib/host';

type Props = {
  me?: Profile;
  clubName?: string;
};

export function Topbar({ me, clubName }: Props) {
  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined);
    window.location.href = rootUrl('/');
  };

  return (
    <header className="topbar">
      <a className="wordmark" href={rootUrl('/')}>
        OpenChess
        {clubName && <small>{clubName}</small>}
      </a>
      {me && (
        <div className="topbar-user">
          <span>{me.displayName}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
          >
            Salir
          </button>
        </div>
      )}
    </header>
  );
}
