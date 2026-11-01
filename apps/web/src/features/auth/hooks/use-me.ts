'use client';
import { authApi } from '../api/auth.api';

import type { Profile } from '@openchess/contracts';
import { useCallback, useEffect, useState } from 'react';

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
    authApi
      .me()
      .then(({ data }) => !cancelled && setState({ status: 'ready', me: data }))
      .catch(() => !cancelled && setState({ status: 'anonymous' }));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
