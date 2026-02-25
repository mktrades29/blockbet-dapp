/**
 * Vercel Node.js Serverless Function — proxies btc_call JSON-RPC to the OP_NET node.
 * Runs server-side so there are no browser CORS restrictions.
 */

export default async function handler(
  req: { method: string; body: unknown },
  res: {
    status(code: number): {
      json(data: unknown): void;
      end(msg?: string): void;
    };
    setHeader(name: string, value: string): void;
    json(data: unknown): void;
  },
) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const base   = (process.env.VITE_OPNET_NODE_URL ?? 'https://regtest.opnet.org').replace(/\/$/, '');
  const rpcUrl = base.includes('/api/v1/json-rpc') ? base : `${base}/api/v1/json-rpc`;

  try {
    const upstream = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    const text = await upstream.text();

    res.status(upstream.status).json(
      (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })(),
    );
  } catch (err: unknown) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    res.status(502).json({ error: `Proxy could not reach ${rpcUrl} — ${detail}` });
  }
}
