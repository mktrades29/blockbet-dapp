/**
 * TypeScript ambient declarations for the OPWallet browser extension.
 * OPWallet injects `window.opnet` into the browser context.
 *
 * Actual API discovered by inspecting window.opnet at runtime.
 */

export interface OPWalletAccount {
  /** Bitcoin address (P2TR / P2WPKH) */
  address: string;
  /** Compressed public key hex */
  publicKey: string;
  /** Address type: 'p2tr' | 'p2wpkh' | 'p2pkh' */
  addressType: string;
}

export interface OPWalletInteractionParams {
  /** OP_NET contract address */
  to: string;
  /**
   * ABI-encoded calldata.
   * The wallet calls `.toString("hex")` on this value internally,
   * so a plain hex string works (string.toString() is identity).
   */
  calldata: string;
  /** Satoshis to attach to the transaction */
  value?: number;
}

export interface OPWalletInteractionResult {
  /** Transaction ID (txid) */
  txid: string;
  /** Raw signed transaction hex (optional) */
  hex?: string;
}

export interface OPWalletProvider {
  /**
   * Request wallet connection (shows browser popup).
   * Returns array of Bitcoin addresses.
   */
  requestAccounts(): Promise<string[]>;

  /**
   * Get currently connected addresses without prompting.
   * Returns [] if not connected.
   */
  getAccounts(): Promise<string[]>;

  /**
   * Get the compressed public key of the active account (33-byte hex).
   */
  getPublicKey(): Promise<string>;

  /**
   * Disconnect the current session.
   */
  disconnect(): Promise<void>;

  /** Get current network info. */
  getNetwork(): Promise<Record<string, unknown>>;

  /** Get current chain info. */
  getChain(): Promise<Record<string, unknown>>;

  /**
   * Sign and broadcast a state-changing contract interaction.
   * Internally calls queryContractInformation(to) then _request().
   */
  signAndBroadcastInteraction(
    params: OPWalletInteractionParams,
  ): Promise<OPWalletInteractionResult>;

  /**
   * Sign a contract interaction without broadcasting.
   */
  signInteraction(params: OPWalletInteractionParams): Promise<unknown>;

  /** EventEmitter: subscribe to wallet events. */
  on(event: string, handler: (...args: unknown[]) => void): void;
  /** EventEmitter: unsubscribe from wallet events. */
  off(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    /** Injected by the OPWallet browser extension */
    opnet?: OPWalletProvider;
  }
}
