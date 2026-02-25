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

  // Health-check: GET /api/opnet returns the upstream URL
  if (req.method === 'GET') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envUrl2 = (globalThis as any).process?.env?.VITE_OPNET_NODE_URL as string | undefined;
    const b = (envUrl2 ?? 'https://regtest.opnet.org').replace(/\/$/, '');
    const u = b.includes('/api/v1/json-rpc') ? b : `${b}/api/v1/json-rpc`;
    res.status(200).json({ ok: true, upstream: u });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Access env via globalThis to avoid TypeScript "process not found" when
  // the tsconfig only includes "vite/client" types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const envUrl = (globalThis as any).process?.env?.VITE_OPNET_NODE_URL as string | undefined;
  const base   = (envUrl ?? 'https://regtest.opnet.org').replace(/\/$/, '');
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
