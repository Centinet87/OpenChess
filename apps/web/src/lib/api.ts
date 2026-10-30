import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

export type {
  GameView,
  InvitationView,
  MemberView,
  MyClubView,
  Permission,
  Profile,
  RoleSummary,
  RoleView,
} from '@openchess/contracts';

/** Todo va a /api del mismo dominio: Next lo reenvía a la API con las cookies. */
export const api = axios.create({ baseURL: '/api', withCredentials: true });

let refreshing: Promise<void> | null = null;

/** Un solo refresh aunque fallen varias requests a la vez (si no, el refresh rotativo cierra la sesión). */
export function refreshSession(): Promise<void> {
  refreshing ??= api
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Si el access token venció (15 min), se renueva con el refresh y se reintenta una vez.
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as
    (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthRoute = original?.url?.startsWith('/auth/');
  if (
    error.response?.status !== 401 ||
    !original ||
    original._retried ||
    isAuthRoute
  ) {
    throw error;
  }
  original._retried = true;
  await refreshSession();
  return api(original);
});

/** Mensaje legible de un error de la API (ApiError o ValidationError de contracts). */
export function errorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: unknown } | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (Array.isArray(data?.message)) {
      return (data.message as { message?: string }[])
        .map((m) => m.message)
        .join('. ');
    }
    if (!error.response) return 'No hay conexión con el servidor';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}
