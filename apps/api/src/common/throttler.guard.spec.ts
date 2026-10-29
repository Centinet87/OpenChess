import { loadEnv, secureCookies } from '../config/env';
import { throttleKey } from './throttler.guard';

describe('throttleKey', () => {
  it('separa por email en login y registro', () => {
    expect(throttleKey('1.2.3.4', { email: ' Ana@X.cl ' })).toBe(
      '1.2.3.4:ana@x.cl',
    );
    expect(throttleKey('1.2.3.4', { email: 'beto@x.cl' })).not.toBe(
      throttleKey('1.2.3.4', { email: 'ana@x.cl' }),
    );
  });

  it('sin email usa solo la IP', () => {
    expect(throttleKey('1.2.3.4', undefined)).toBe('1.2.3.4');
    expect(throttleKey('1.2.3.4', { email: 42 })).toBe('1.2.3.4');
  });
});

describe('loadEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
  };

  it('en producción exige COOKIE_DOMAIN', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      'COOKIE_DOMAIN',
    );
    expect(
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        COOKIE_DOMAIN: '.openchess.app',
        PUBLIC_URL: 'https://openchess.app',
        RESEND_API_KEY: 're_123',
      }).COOKIE_DOMAIN,
    ).toBe('.openchess.app');
  });

  it('en producción exige PUBLIC_URL con https y la clave de Resend', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      COOKIE_DOMAIN: '.openchess.app',
    };
    expect(() => loadEnv({ ...prod, RESEND_API_KEY: 're_1' })).toThrow(
      'PUBLIC_URL',
    );
    expect(() =>
      loadEnv({ ...prod, PUBLIC_URL: 'https://openchess.app' }),
    ).toThrow('RESEND_API_KEY');
  });

  it('las cookies van con Secure en producción o si el sitio es https, aunque falte NODE_ENV', () => {
    expect(secureCookies(loadEnv(base))).toBe(false);
    expect(
      secureCookies(loadEnv({ ...base, PUBLIC_URL: 'https://openchess.app' })),
    ).toBe(true);
  });

  it('rechaza un JWT_SECRET corto y lee TRUST_PROXY', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'corto' })).toThrow(
      'JWT_SECRET',
    );
    expect(loadEnv({ ...base, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
  });
});
