import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { api } from './api';

/** Fakes the API: `/auth/refresh` renews the session and every other route needs a live one. */
function fakeApi(login401 = false) {
  const calls: string[] = [];
  let hasSession = false;
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? '';
    calls.push(url);
    const reply = (status: number, data: unknown): AxiosResponse => ({
      status,
      statusText: '',
      data,
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    });
    if (url === '/auth/refresh') {
      hasSession = true;
      return reply(200, { ok: true });
    }
    const unauthorized = url === '/auth/login' ? login401 : !hasSession;
    if (unauthorized) {
      throw new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        config,
        null,
        reply(401, { message: 'Unauthorized' }),
      );
    }
    return reply(200, { ok: true });
  };
  return calls;
}

describe('session refresh', () => {
  it('refreshes and retries /auth/me when the access token expired', async () => {
    const calls = fakeApi();
    const { data } = await api.get('/auth/me');
    expect(data).toEqual({ ok: true });
    expect(calls).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
  });

  it('does not refresh when login returns 401', async () => {
    const calls = fakeApi(true);
    await expect(api.post('/auth/login')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(calls).toEqual(['/auth/login']);
  });
});
