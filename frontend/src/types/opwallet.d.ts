/**
 * TypeScript ambient declarations for the OPWallet browser extension.
 * OPWallet injects `window.opnet` into the browser context.
 *
 * Docs: https://docs.opnet.org/wallet
 */

export interface OPWalletAccount {
  /** Bitcoin address (P2TR / P2WPKH) */
  address: string;
  /** Compressed public key hex */
  publicKey: string;
  /** Address type: 'p2tr' | 'p2wpkh' | 'p2pkh' */
  addressType: string;
}

export interface OPWalletCallParams {
  /** OP_NET contract address */
  to: string;
  /** ABI-encoded calldata (hex string, no 0x prefix) */
  calldata: string;
  /** Satoshis to attach to the transaction */
  value?: number;
  /** Optional gas / fee rate in sat/vbyte */
  feeRate?: number;
}

export interface OPWalletCallResult {
  /** Transaction ID (txid) */
  txid: string;
  /** Raw signed transaction hex */
  hex: string;
}

export interface OPWalletReadParams {
  /** OP_NET contract address */
  to: string;
  /** ABI-encoded calldata (hex string) */
  calldata: string;
}

export interface OPWalletReadResult {
  /** ABI-encoded return data (hex string) */
  data: string;
}

export interface OPWalletProvider {
  /**
   * Request wallet connection.
   * Prompts the user to approve connection and returns their account.
   */
  connect(): Promise<OPWalletAccount>;

  /**
   * Disconnect the current session.
   */
  disconnect(): Promise<void>;

  /**
   * Get the currently connected account (null if not connected).
   */
  getAccount(): Promise<OPWalletAccount | null>;

  /**
   * Send a state-changing transaction to an OP_NET contract.
   */
  call(params: OPWalletCallParams): Promise<OPWalletCallResult>;

  /**
   * Read contract state without broadcasting a transaction.
   */
  read(params: OPWalletReadParams): Promise<OPWalletReadResult>;

  /**
   * Subscribe to wallet events.
   */
  on(event: 'accountsChanged', handler: (account: OPWalletAccount | null) => void): void;
  on(event: 'disconnect', handler: () => void): void;
  on(event: 'chainChanged', handler: (chainId: string) => void): void;

  off(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    /** Injected by the OPWallet browser extension */
    opnet?: OPWalletProvider;
  }
}
