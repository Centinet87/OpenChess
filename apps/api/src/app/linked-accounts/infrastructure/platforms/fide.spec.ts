import { LinkError } from '../../domain/errors';
import { parseFideProfile } from './fide';

/** Recorte de una ficha de ratings.fide.com con la estructura que tiene la página. */
const PROFILE = `
<div class="profile-top">
  <div class="profile-top-title">Carlsen, Magnus</div>
  <div class="profile-top-rating-data profile-top-rating-data_gray">
    <span class="profile-top-rating-dataDesc">std</span>
    2830
  </div>
  <div class="profile-top-rating-data profile-top-rating-data_red">
    <span class="profile-top-rating-dataDesc">rapid</span>
    2824
  </div>
  <div class="profile-top-rating-data profile-top-rating-data_blue">
    <span class="profile-top-rating-dataDesc">blitz</span>
    2886
  </div>
  <div class="profile-top-info__block__row">
    <div class="profile-top-info__block__row__header">Federation:</div>
    <div class="profile-top-info__block__row__data">Norway</div>
  </div>
  <div class="profile-top-info__block__row">
    <div class="profile-top-info__block__row__header">FIDE title:</div>
    <div class="profile-top-info__block__row__data">Grandmaster</div>
  </div>
</div>`;

describe('ficha de FIDE', () => {
  it('lee nombre, federación, título y los tres ritmos', () => {
    expect(parseFideProfile(PROFILE, '1503014')).toEqual({
      fideId: '1503014',
      name: 'Carlsen, Magnus',
      federation: 'Norway',
      title: 'Grandmaster',
      ratings: { standard: 2830, rapid: 2824, blitz: 2886 },
    });
  });

  it('sin rating en un ritmo, o sin título, no lo inventa', () => {
    const html = PROFILE.replace(
      /<span class="profile-top-rating-dataDesc">rapid<\/span>\s*2824/,
      '<span class="profile-top-rating-dataDesc">rapid</span> Not rated',
    )
      .replace('Grandmaster', 'None')
      .replace('Carlsen, Magnus', 'O&#039;Brien, Ana &amp; Co');
    expect(parseFideProfile(html, '1')).toMatchObject({
      name: "O'Brien, Ana & Co",
      title: null,
      ratings: { standard: 2830, blitz: 2886 },
    });
  });

  it('una ficha vacía es un FIDE ID que no existe', () => {
    expect(
      parseFideProfile(
        '<div class="profile-top"><div class="profile-top-title"></div></div>',
        '999',
      ),
    ).toBeNull();
  });

  it('si la página no tiene el formato conocido, falla en vez de guardar datos a medias', () => {
    expect(() => parseFideProfile('<html>Mantenimiento</html>', '1')).toThrow(
      LinkError,
    );
  });
});
