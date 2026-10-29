// Tests contra el Postgres local (docker compose up -d). Corren con `nx run database:test-db`.
const base = require('./jest.config.cts');

const [swc, swcOptions] = Object.values(base.transform)[0];

module.exports = {
  ...base,
  displayName: 'database-db',
  testMatch: ['<rootDir>/src/**/*.db-spec.ts'],
  // Prisma 7 carga su motor como .mjs: hay que pasarlo por SWC para que Jest (CommonJS) lo entienda.
  transform: { '^.+\\.(m?js|ts)$': [swc, swcOptions] },
  transformIgnorePatterns: ['node_modules/(?!@prisma/)'],
};
