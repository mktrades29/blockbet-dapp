/**
 * Vercel Edge Function — proxies btc_call JSON-RPC requests to the OP_NET node.
 * Runs server-side so there are no browser CORS restrictions.
 */
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const base   = (process.env.VITE_OPNET_NODE_URL ?? 'https://regtest.opnet.org').replace(/\/$/, '');
  const rpcUrl = base.includes('/api/v1/json-rpc') ? base : `${base}/api/v1/json-rpc`;

  try {
    const body     = await req.text();
    const upstream = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status:  upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${String(err)}. Node: ${rpcUrl}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
