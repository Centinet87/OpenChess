import { createHmac, timingSafeEqual } from 'node:crypto';
export function isValidWebhookSignature(input: {
  secret: string;
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string;
}): boolean {
  if (!input.signature || !input.requestId) return false;
  const parts = Object.fromEntries(
    input.signature.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  const { ts, v1 } = parts as { ts?: string; v1?: string };
  if (!ts || !v1) return false;
  // Los ids alfanuméricos van en minúsculas en el manifiesto.
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac('sha256', input.secret)
    .update(manifest)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
