import { createHmac } from 'node:crypto';
import { isValidWebhookSignature } from '../../application/security/webhook-signature';
import { BillingError } from '../../domain/errors';
import { MercadoPagoGateway, parsePreapproval } from './mercadopago';

describe('Mercado Pago', () => {
  afterEach(() => jest.restoreAllMocks());

  it('traduce los estados de la suscripción y lee el club de external_reference', () => {
    expect(
      parsePreapproval({
        id: 'pre-1',
        status: 'authorized',
        external_reference: 'club-1',
        payer_email: 'ana@test.local',
        next_payment_date: '2026-11-29T10:00:00.000-03:00',
      }),
    ).toEqual({
      id: 'pre-1',
      status: 'active',
      clubId: 'club-1',
      payerEmail: 'ana@test.local',
      nextPaymentAt: new Date('2026-11-29T13:00:00.000Z'),
    });
    expect(
      parsePreapproval({
        id: 'x',
        status: 'cancelled',
        external_reference: 'c',
      })?.status,
    ).toBe('cancelled');
    // Sin external_reference no la creó OpenChess.
    expect(parsePreapproval({ id: 'x', status: 'authorized' })).toBeNull();
  });

  describe('firma del webhook', () => {
    const secret = 'clave-secreta';
    const sign = (dataId: string, requestId: string, ts: string) =>
      createHmac('sha256', secret)
        .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
        .digest('hex');

    it('acepta la firma correcta y rechaza una alterada o ausente', () => {
      const v1 = sign('pre-1', 'req-1', '1704908010');
      const ok = {
        secret,
        signature: `ts=1704908010,v1=${v1}`,
        requestId: 'req-1',
        dataId: 'PRE-1',
      };
      expect(isValidWebhookSignature(ok)).toBe(true);
      expect(isValidWebhookSignature({ ...ok, dataId: 'pre-2' })).toBe(false);
      expect(isValidWebhookSignature({ ...ok, requestId: 'otro' })).toBe(false);
      expect(isValidWebhookSignature({ ...ok, signature: undefined })).toBe(
        false,
      );
      expect(isValidWebhookSignature({ ...ok, signature: 'ts=1,v1=abc' })).toBe(
        false,
      );
    });
  });

  it('crea la suscripción mensual con el precio, la moneda y el club', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'pre-1',
          status: 'pending',
          external_reference: 'club-1',
          payer_email: 'ana@test.local',
          init_point: 'https://www.mercadopago.cl/subscriptions/checkout?x=1',
        }),
        { status: 201 },
      ),
    );
    const gateway = new MercadoPagoGateway({
      accessToken: 'TEST-123',
      price: 9990,
      currency: 'CLP',
    });
    const res = await gateway.createSubscription({
      clubId: 'club-1',
      clubName: 'Club Sur',
      payerEmail: 'ana@test.local',
      backUrl: 'https://openchess.app/plan',
    });

    expect(res.checkoutUrl).toContain('mercadopago.cl');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer TEST-123' });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      external_reference: 'club-1',
      reason: 'OpenChess Pro — Club Sur',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 9990,
        currency_id: 'CLP',
      },
    });
  });

  it('sin token o si Mercado Pago falla, los pagos no están disponibles', async () => {
    const noToken = new MercadoPagoGateway({
      accessToken: undefined,
      price: 1,
      currency: 'CLP',
    });
    await expect(noToken.getSubscription('x')).rejects.toBeInstanceOf(
      BillingError,
    );
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('error', { status: 500 }));
    const gateway = new MercadoPagoGateway({
      accessToken: 'T',
      price: 1,
      currency: 'CLP',
    });
    await expect(gateway.cancelSubscription('x')).rejects.toBeInstanceOf(
      BillingError,
    );
  });
});
