import { createPrismaClient } from './database.js';

describe('createPrismaClient', () => {
  it('rechaza una URL vacía', () => {
    expect(() => createPrismaClient('')).toThrow('DATABASE_URL');
  });

  it('crea el cliente sin conectarse todavía', async () => {
    const client = createPrismaClient('postgresql://u:p@localhost:5432/db');
    expect(typeof client.$connect).toBe('function');
    await client.$disconnect();
  });
});
