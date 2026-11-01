import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { api, errorMessage } from './client';

const originalAdapter = api.defaults.adapter;
function response(
  config: InternalAxiosRequestConfig,
  status = 200,
  data: unknown = {},
): AxiosResponse {
  return { config, status, statusText: String(status), headers: {}, data };
}
function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError(
    'Unauthorized',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    response(config, 401),
  );
}
afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe('cliente HTTP', () => {
  it('comparte un refresh entre requests concurrentes y conserva cookies y datos al reintentar', async () => {
    let renewed = false;
    const requests: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = jest.fn(
      async (config: InternalAxiosRequestConfig) => {
        requests.push(config);
        if (config.url === '/auth/refresh') {
          renewed = true;
          return response(config);
        }
        if (!renewed) throw unauthorized(config);
        return response(config, 200, { ok: true });
      },
    );
    const results = await Promise.all([
      api.get('/clubs/mine'),
      api.patch('/club/members/member', { roleId: 'role' }),
    ]);
    expect(results.map((result) => result.data)).toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(
      requests.filter((config) => config.url === '/auth/refresh'),
    ).toHaveLength(1);
    expect(
      requests.every(
        (config) => config.baseURL === '/api' && config.withCredentials,
      ),
    ).toBe(true);
    const patches = requests.filter((config) => config.method === 'patch');
    expect(patches).toHaveLength(2);
    expect(patches.map((config) => JSON.parse(config.data))).toEqual([
      { roleId: 'role' },
      { roleId: 'role' },
    ]);
  });

  it('renueva el acceso cuando /auth/me recibe 401', async () => {
    let renewed = false;
    api.defaults.adapter = jest.fn(
      async (config: InternalAxiosRequestConfig) => {
        if (config.url === '/auth/refresh') {
          renewed = true;
          return response(config);
        }
        if (!renewed) throw unauthorized(config);
        return response(config, 200, { id: 'user' });
      },
    );
    await expect(api.get('/auth/me')).resolves.toMatchObject({
      data: { id: 'user' },
    });
  });

  it.each(['/auth/login', '/auth/register', '/auth/logout', '/auth/password'])(
    'no intenta renovar por errores de %s',
    async (path) => {
      const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
        throw unauthorized(config);
      });
      api.defaults.adapter = adapter;
      await expect(api.post(path)).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(adapter).toHaveBeenCalledTimes(1);
    },
  );

  it('un 401 después del refresh no entra en un bucle', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/refresh') return response(config);
      throw unauthorized(config);
    });
    api.defaults.adapter = adapter;
    await expect(api.get('/club/me')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(adapter).toHaveBeenCalledTimes(3);
  });

  it('un refresh rechazado termina sin reintentar la petición protegida', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw unauthorized(config);
    });
    api.defaults.adapter = adapter;
    await expect(api.get('/club/me')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('no renueva la sesión ante una falta de permisos', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError(
        'Forbidden',
        undefined,
        config,
        undefined,
        response(config, 403),
      );
    });
    api.defaults.adapter = adapter;
    await expect(api.get('/club/roles')).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

describe('mensajes de error', () => {
  it.each([
    ['Email ocupado', 'Email ocupado'],
    [
      ['Email inválido', 'Nombre requerido'],
      'Email inválido. Nombre requerido',
    ],
    [
      [{ message: 'Email inválido' }, { message: 'Nombre requerido' }],
      'Email inválido. Nombre requerido',
    ],
    [[null, { invalid: true }, 'Nombre requerido'], 'Nombre requerido'],
    [[null, {}], 'Algo salió mal. Inténtalo de nuevo.'],
  ])('interpreta la respuesta de validación %s', (message, expected) => {
    const error = new AxiosError(
      'Bad Request',
      undefined,
      undefined,
      undefined,
      { data: { message } } as AxiosResponse,
    );
    expect(errorMessage(error)).toBe(expected);
  });
  it('distingue fallos de red de errores desconocidos', () => {
    expect(errorMessage(new AxiosError('Network error'))).toBe(
      'No hay conexión con el servidor',
    );
    expect(errorMessage(new Error('Internal'))).toBe(
      'Algo salió mal. Inténtalo de nuevo.',
    );
  });
});
