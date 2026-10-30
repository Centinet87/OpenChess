'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Profile } from './api';

type MeState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; me: Profile };

/** Usuario de la sesión. `reload` sirve después de iniciar o cerrar sesión. */
export function useMe(): MeState & { reload: () => void } {
  const [state, setState] = useState<MeState>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Profile>('/auth/me')
      .then(({ data }) => !cancelled && setState({ status: 'ready', me: data }))
      .catch(() => !cancelled && setState({ status: 'anonymous' }));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
