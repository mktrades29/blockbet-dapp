/**
 * Vercel Serverless Function — proxies btc_call JSON-RPC to the OP_NET node.
 * Eliminates browser CORS restrictions by running server-side.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const base   = (process.env.VITE_OPNET_NODE_URL || 'https://regtest.opnet.org').trim().replace(/\/$/, '');
  const rpcUrl = base.includes('/api/v1/json-rpc') ? base : `${base}/api/v1/json-rpc`;

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, upstream: rpcUrl });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const upstream = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

    return res.status(upstream.status).json(data);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return res.status(502).json({ error: `Proxy error reaching ${rpcUrl}: ${detail}` });
  }
};
