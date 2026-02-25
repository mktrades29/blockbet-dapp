/**
 * OP_NET contract interaction utilities.
 *
 * Handles ABI encoding/decoding for the BlockBet contract
 * and wraps OPWallet provider calls.
 */

import type { OPWalletInteractionResult } from '../types/opwallet';

// ─── Contract address ─────────────────────────────────────────────────────────
export const BLOCKBET_CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string) ||
  'opr1sqqrgl4fwkxgtgdjg96t49wwwekl2fz6gacrgnall';

// ─── OP_NET node URL (for contract reads via JSON-RPC) ───────────────────────
// Set VITE_OPNET_NODE_URL in Vercel environment variables to override.
// Mainnet:  https://mainnet.opnet.org  (default)
// Regtest:  https://regtest.opnet.org
export const OPNET_NODE_URL =
  (import.meta.env.VITE_OPNET_NODE_URL as string) || 'https://mainnet.opnet.org';

// ─── Method selectors ─────────────────────────────────────────────────────────
// Signatures must exactly match the contract's encodeSelector() calls.
export const SELECTORS = {
  bet:                  'bet(bool,uint64)',
  settle:               'settle()',
  claim:                'claim()',
  withdraw:             'withdraw()',
  startNewRound:        'startNewRound()',
  getRoundInfo:         'getRoundInfo()',
  getBetInfo:           'getBetInfo(address)',
  getPendingWithdrawal: 'getPendingWithdrawal(address)',
  setTreasury:          'setTreasury(address)',
  setHouseFeeBps:       'setHouseFeeBps(uint64)',
} as const;

// ─── Primitive encoders ───────────────────────────────────────────────────────

/** Encode a boolean as 1 byte. */
export function encodeBool(value: boolean): Uint8Array {
  return new Uint8Array([value ? 1 : 0]);
}

/**
 * Encode a u64 as 8 bytes big-endian.
 * Matches BytesReader.readU64(be = true) in the contract runtime.
 */
export function encodeU64(value: number | bigint): Uint8Array {
  const n = BigInt(value);
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[7 - i] = Number((n >> BigInt(i * 8)) & 0xffn);
  }
  return buf;
}

/**
 * Encode a raw 32-byte OP_NET address.
 * Contract's BytesReader.readAddress() reads exactly 32 bytes.
 */
export function encodeOpnetAddress(addressBytes: Uint8Array): Uint8Array {
  if (addressBytes.length !== 32) {
    throw new Error(`encodeOpnetAddress: expected 32 bytes, got ${addressBytes.length}`);
  }
  return addressBytes;
}

/**
 * Derive the 32-byte OP_NET address from a compressed public key hex string.
 * OP_NET addresses = SHA-256(compressedPublicKey).
 */
export async function pubkeyToOpnetAddress(publicKeyHex: string): Promise<Uint8Array> {
  const pubkeyBytes = fromHex(publicKeyHex);
  const hashBuffer  = await crypto.subtle.digest('SHA-256', pubkeyBytes.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

/** Concatenate multiple Uint8Array buffers. */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** Convert Uint8Array to hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to Uint8Array. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Encode a 4-byte selector from a method signature string.
 * Uses FNV-1a 32-bit hash in little-endian, matching encodeSelector() in btc-runtime.
 */
export function encodeSelector(methodSig: string): Uint8Array {
  let hash = 0x811c9dc5;
  for (let i = 0; i < methodSig.length; i++) {
    hash ^= methodSig.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, hash, true); // little-endian
  return buf;
}

/** Build hex calldata: selector + encoded args. */
export function buildCalldata(methodSig: string, ...args: Uint8Array[]): string {
  const selector = encodeSelector(methodSig);
  const payload  = concat(selector, ...args);
  return toHex(payload);
}

// ─── ABI decoder ──────────────────────────────────────────────────────────────

export class BytesDecoder {
  private view: DataView;
  private offset = 0;

  constructor(hex: string) {
    const bytes = fromHex(hex);
    this.view = new DataView(bytes.buffer);
  }

  readBoolean(): boolean {
    return this.view.getUint8(this.offset++) !== 0;
  }

  /**
   * Read u64 as big-endian (matches BytesWriter.writeU64 default in contract).
   */
  readU64(): bigint {
    const hi = BigInt(this.view.getUint32(this.offset,     false)); // big-endian
    const lo = BigInt(this.view.getUint32(this.offset + 4, false)); // big-endian
    this.offset += 8;
    return (hi << 32n) | lo;
  }

  /**
   * Read a u256 as 32 bytes big-endian (matches u256.toUint8Array(true) in contract).
   */
  readU256(): bigint {
    let value = 0n;
    for (let i = 0; i < 32; i++) {
      value = (value << 8n) | BigInt(this.view.getUint8(this.offset + i));
    }
    this.offset += 32;
    return value;
  }
}

// ─── Decoded types ────────────────────────────────────────────────────────────

export interface RoundInfo {
  roundId:      bigint;
  targetBlock:  bigint;
  evenPool:     bigint; // satoshis
  oddPool:      bigint; // satoshis
  settled:      boolean;
  winnerSide:   0 | 1 | 2; // 0=unknown, 1=even, 2=odd
  currentBlock: bigint;
  winningBlock: bigint;
}

export interface BetInfo {
  evenBet: bigint; // satoshis
  oddBet:  bigint;
  claimed: boolean;
}

/** Parse getRoundInfo() response bytes. */
export function decodeRoundInfo(hexData: string): RoundInfo {
  const d = new BytesDecoder(hexData);
  return {
    roundId:      d.readU256(),
    targetBlock:  d.readU256(),
    evenPool:     d.readU256(),
    oddPool:      d.readU256(),
    settled:      d.readBoolean(),
    winnerSide:   Number(d.readU256()) as 0 | 1 | 2,
    currentBlock: d.readU256(),
    winningBlock: d.readU256(),
  };
}

/** Parse getBetInfo() response bytes. */
export function decodeBetInfo(hexData: string): BetInfo {
  const d = new BytesDecoder(hexData);
  return {
    evenBet: d.readU256(),
    oddBet:  d.readU256(),
    claimed: d.readBoolean(),
  };
}

/** Parse getPendingWithdrawal() response bytes. */
export function decodePendingWithdrawal(hexData: string): bigint {
  return new BytesDecoder(hexData).readU256();
}

// ─── OPWallet wrappers ────────────────────────────────────────────────────────

function getWallet() {
  if (!window.opnet) {
    throw new Error('OPWallet extension not detected. Please install it from https://opwallet.io');
  }
  return window.opnet;
}

/** Call a state-changing method on the BlockBet contract. */
export async function contractCall(
  methodSig: string,
  args: Uint8Array[],
  valueSats: number,
): Promise<OPWalletInteractionResult> {
  const wallet   = getWallet();
  const calldata = buildCalldata(methodSig, ...args);
  // The wallet calls calldata.toString("hex") internally;
  // passing a hex string is fine since string.toString() is identity.
  return wallet.signAndBroadcastInteraction({
    to:    BLOCKBET_CONTRACT_ADDRESS,
    calldata,
    value: valueSats,
  });
}

/**
 * Read from the BlockBet contract via the OP_NET node JSON-RPC API.
 * No wallet required — reads are unauthenticated.
 *
 * Uses the `btc_call` JSON-RPC method (OP_NET protocol).
 * Configure the node with VITE_OPNET_NODE_URL in Vercel environment variables.
 */
export async function contractRead(
  methodSig: string,
  args: Uint8Array[] = [],
): Promise<{ data: string }> {
  const calldata = buildCalldata(methodSig, ...args);

  // btc_call params: [to, data, from?, fromLegacy?, height?, simulatedTx?, accessList?]
  const payload = {
    jsonrpc: '2.0',
    method:  'btc_call',
    params:  [BLOCKBET_CONTRACT_ADDRESS, calldata],
    id:      1,
  };

  // regtest.opnet.org returns Access-Control-Allow-Origin: * so the browser
  // can call it directly. The Vercel proxy only blocked cloud IPs.
  const rpcUrl = OPNET_NODE_URL.includes('/api/v1/json-rpc')
    ? OPNET_NODE_URL
    : `${OPNET_NODE_URL}/api/v1/json-rpc`;

  const res = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.clone().json() as { error?: string }; if (j.error) detail = j.error; } catch { /* ignore */ }
    throw new Error(`OP_NET node ${res.status}: ${detail}`);
  }

  type RpcResponse = {
    result?: { result?: string; data?: string } | string;
    error?:  { message: string; code?: number } | string;
  };
  const json = await res.json() as RpcResponse;

  if (json.error) {
    const msg = typeof json.error === 'string' ? json.error : json.error.message;
    throw new Error(`OP_NET error: ${msg}`);
  }

  // Normalise: result can be a plain hex string or { result: hex, ... }
  let data = '';
  if (typeof json.result === 'string') {
    data = json.result;
  } else if (json.result) {
    data = json.result.result ?? json.result.data ?? '';
  }
  if (data.startsWith('0x')) data = data.slice(2);

  return { data };
}

// ─── Mempool.space helpers ─────────────────────────────────────────────────────

const MEMPOOL_API = 'https://mempool.space/api';

export interface BlockTip {
  height: number;
  hash:   string;
  time:   number; // unix timestamp
}

/** Fetch the current Bitcoin chain tip. */
export async function fetchChainTip(): Promise<BlockTip> {
  const [heightRes, hashRes] = await Promise.all([
    fetch(`${MEMPOOL_API}/blocks/tip/height`),
    fetch(`${MEMPOOL_API}/blocks/tip/hash`),
  ]);
  const height = parseInt(await heightRes.text(), 10);
  const hash   = (await hashRes.text()).trim();

  const blockRes  = await fetch(`${MEMPOOL_API}/block/${hash}`);
  const blockData = await blockRes.json() as { timestamp: number };

  return { height, hash, time: blockData.timestamp };
}

/** Convert satoshis to BTC string. */
export function satsToBtc(sats: bigint): string {
  const btc = Number(sats) / 1e8;
  return btc.toFixed(8).replace(/\.?0+$/, '') || '0';
}

/** Convert BTC string to satoshis. */
export function btcToSats(btc: string): number {
  return Math.round(parseFloat(btc) * 1e8);
}
