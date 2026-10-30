import { ResendMailer } from './mailer';

describe('ResendMailer', () => {
  const email = {
    to: 'ana@test.local',
    subject: 'Hola',
    text: 'texto',
    html: '<p>texto</p>',
  };

  afterEach(() => jest.restoreAllMocks());

  it('manda el email a la API de Resend con la clave y el remitente', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    await new ResendMailer('re_123', 'OpenChess <no-reply@x.cl>').send(email);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer re_123' });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: 'OpenChess <no-reply@x.cl>',
      ...email,
    });
  });

  it('lanza si Resend no lo acepta', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('dominio sin verificar', { status: 403 }),
      );
    await expect(new ResendMailer('k', 'f').send(email)).rejects.toThrow('403');
  });
});
