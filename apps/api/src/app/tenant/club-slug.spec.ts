import { resolveClubSlug } from './club-slug';

describe('resolveClubSlug', () => {
  it.each([
    ['miclub.openchess.app', 'miclub'],
    ['MiClub.OpenChess.app:443', 'miclub'],
    ['club-uno.localhost:3000', 'club-uno'],
  ])('%s → %s', (host, slug) => {
    const domain = host.includes('localhost') ? 'localhost' : 'openchess.app';
    expect(resolveClubSlug(host, domain)).toBe(slug);
  });

  it.each([
    [undefined],
    ['openchess.app'],
    ['www.openchess.app'],
    ['api.openchess.app'],
    ['a.b.openchess.app'],
    ['-mal.openchess.app'],
    ['miclub.otrodominio.com'],
    ['evilopenchess.app'],
  ])('%s no es un club', (host) => {
    expect(resolveClubSlug(host, 'openchess.app')).toBeNull();
  });
});
