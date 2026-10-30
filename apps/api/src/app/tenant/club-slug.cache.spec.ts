import { ClubSlugCache } from './club-slug.cache';

describe('ClubSlugCache', () => {
  it('recuerda el id un rato y lo olvida al vencer', () => {
    const cache = new ClubSlugCache();
    cache.set('sur', 'id-1', 0);
    expect(cache.get('sur', 29_999)).toBe('id-1');
    expect(cache.get('sur', 30_000)).toBeUndefined();
  });

  it('un subdominio sin club se recuerda menos tiempo', () => {
    const cache = new ClubSlugCache();
    cache.set('nadie', null, 0);
    expect(cache.get('nadie', 4_999)).toBeNull();
    expect(cache.get('nadie', 5_000)).toBeUndefined();
  });

  it('al sacarlo, la próxima request vuelve a buscarlo', () => {
    const cache = new ClubSlugCache();
    cache.set('sur', 'id-viejo', 0);
    cache.evict('sur');
    expect(cache.get('sur', 1)).toBeUndefined();
  });
});
