/**
 * useBlockBet — primary hook for BlockBet contract interaction.
 *
 * Manages wallet state, contract reads, bet placement, settlement, claims, and withdrawals.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { OPWalletAccount } from '../types/opwallet';
import {
  SELECTORS,
  contractCall,
  contractRead,
  encodeBool,
  encodeU64,
  encodeOpnetAddress,
  pubkeyToOpnetAddress,
  decodeRoundInfo,
  decodeBetInfo,
  decodePendingWithdrawal,
  fetchChainTip,
  btcToSats,
  type RoundInfo,
  type BetInfo,
  type BlockTip,
} from '../utils/opnet';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BetSide = 'even' | 'odd';

export interface BlockBetState {
  // Wallet
  account:        OPWalletAccount | null;
  opnetAddress:   Uint8Array | null;
  isConnecting:   boolean;
  walletError:    string | null;

  // Round data
  roundInfo:      RoundInfo | null;
  betInfo:        BetInfo | null;
  isLoadingRound: boolean;

  // Pending withdrawal amount (satoshis)
  pendingWithdrawal: bigint;

  // Bitcoin chain
  chainTip:       BlockTip | null;
  secondsToBlock: number;

  // Transaction state
  isBetting:           boolean;
  isSettling:          boolean;
  isClaiming:          boolean;
  isWithdrawing:       boolean;
  isStartingNewRound:  boolean;
  txError:             string | null;
  lastTxId:            string | null;
}

export interface BlockBetActions {
  connectWallet:    () => Promise<void>;
  disconnectWallet: () => void;
  placeBet:         (side: BetSide, amountBtc: string) => Promise<void>;
  settle:           () => Promise<void>;
  claim:            () => Promise<void>;
  withdraw:         () => Promise<void>;
  startNewRound:    () => Promise<void>;
  setTreasury:      (addressBytes: Uint8Array) => Promise<void>;
  refreshRoundInfo: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVG_BLOCK_SECONDS = 600;
const CHAIN_POLL_MS     = 30_000;
const ROUND_POLL_MS     = 15_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlockBet(): BlockBetState & BlockBetActions {
  const [account,        setAccount]        = useState<OPWalletAccount | null>(null);
  const [isConnecting,   setIsConnecting]   = useState(false);
  const [walletError,    setWalletError]    = useState<string | null>(null);
  // Derived 32-byte OP_NET address for this account (SHA-256 of public key)
  const [opnetAddress,   setOpnetAddress]   = useState<Uint8Array | null>(null);

  const [roundInfo,      setRoundInfo]      = useState<RoundInfo | null>(null);
  const [betInfo,        setBetInfo]        = useState<BetInfo | null>(null);
  const [isLoadingRound, setIsLoadingRound] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<bigint>(0n);

  const [chainTip,       setChainTip]       = useState<BlockTip | null>(null);
  const [secondsToBlock, setSecondsToBlock] = useState(AVG_BLOCK_SECONDS);

  const [isBetting,           setIsBetting]           = useState(false);
  const [isSettling,          setIsSettling]           = useState(false);
  const [isClaiming,          setIsClaiming]           = useState(false);
  const [isWithdrawing,       setIsWithdrawing]        = useState(false);
  const [isStartingNewRound,  setIsStartingNewRound]   = useState(false);
  const [txError,             setTxError]              = useState<string | null>(null);
  const [lastTxId,            setLastTxId]             = useState<string | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derive OP_NET address when account changes ──────────────────────────────

  useEffect(() => {
    if (!account) { setOpnetAddress(null); return; }
    pubkeyToOpnetAddress(account.publicKey)
      .then(setOpnetAddress)
      .catch((err) => console.warn('Failed to derive OP_NET address:', err));
  }, [account]);

  // ── Wallet connection ───────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    setWalletError(null);
    try {
      if (!window.opnet) {
        throw new Error('OPWallet extension not detected. Please install it from https://opwallet.io');
      }
      // requestAccounts() returns string[] of addresses; getPublicKey() is a separate call.
      const [addresses, publicKey] = await Promise.all([
        window.opnet.requestAccounts(),
        window.opnet.getPublicKey(),
      ]);
      if (!addresses.length) throw new Error('No accounts returned from wallet');
      const address = addresses[0];
      const addressType =
        address.startsWith('bc1p') || address.startsWith('bcrt1p') ? 'p2tr' :
        address.startsWith('bc1q') || address.startsWith('bcrt1q') ? 'p2wpkh' :
        'p2pkh';
      setAccount({ address, publicKey, addressType });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setWalletError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    window.opnet?.disconnect().catch(console.error);
    setAccount(null);
    setOpnetAddress(null);
    setBetInfo(null);
    setPendingWithdrawal(0n);
  }, []);

  useEffect(() => {
    const wallet = window.opnet;
    if (!wallet) return;

    const onDisconnect = () => {
      setAccount(null);
      setOpnetAddress(null);
      setBetInfo(null);
      setPendingWithdrawal(0n);
    };

    wallet.on('disconnect', onDisconnect);

    // Restore session if wallet was already connected
    wallet.getAccounts().then((addresses) => {
      if (!addresses?.length) return;
      wallet.getPublicKey().then((publicKey) => {
        const address = addresses[0];
        const addressType =
          address.startsWith('bc1p') || address.startsWith('bcrt1p') ? 'p2tr' :
          address.startsWith('bc1q') || address.startsWith('bcrt1q') ? 'p2wpkh' :
          'p2pkh';
        setAccount({ address, publicKey, addressType });
      }).catch(console.warn);
    }).catch(() => {});

    return () => {
      wallet.off('disconnect', onDisconnect as never);
    };
  }, []);

  // ── Round data fetching ─────────────────────────────────────────────────────

  const refreshRoundInfo = useCallback(async () => {
    setIsLoadingRound(true);
    try {
      const res = await contractRead(SELECTORS.getRoundInfo);
      setRoundInfo(decodeRoundInfo(res.data));
    } catch (err) {
      console.warn('Failed to fetch round info:', err);
    } finally {
      setIsLoadingRound(false);
    }
  }, []);

  const refreshBetInfo = useCallback(async (addr: Uint8Array) => {
    try {
      const addrArg = encodeOpnetAddress(addr);
      const [betRes, withdrawRes] = await Promise.all([
        contractRead(SELECTORS.getBetInfo,           [addrArg]),
        contractRead(SELECTORS.getPendingWithdrawal, [addrArg]),
      ]);
      setBetInfo(decodeBetInfo(betRes.data));
      setPendingWithdrawal(decodePendingWithdrawal(withdrawRes.data));
    } catch (err) {
      console.warn('Failed to fetch bet info:', err);
    }
  }, []);

  // ── Chain tip polling ───────────────────────────────────────────────────────

  const refreshChainTip = useCallback(async () => {
    try {
      const tip = await fetchChainTip();
      setChainTip(tip);
    } catch (err) {
      console.warn('Failed to fetch chain tip:', err);
    }
  }, []);

  useEffect(() => {
    if (!chainTip) return;
    const elapsed   = Math.floor(Date.now() / 1000) - chainTip.time;
    const remaining = Math.max(0, AVG_BLOCK_SECONDS - elapsed);
    setSecondsToBlock(remaining);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsToBlock((s) => (s <= 0 ? 0 : s - 1));
    }, 1_000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [chainTip]);

  useEffect(() => {
    refreshChainTip();
    refreshRoundInfo();
    const chainTimer = setInterval(refreshChainTip, CHAIN_POLL_MS);
    const roundTimer = setInterval(refreshRoundInfo, ROUND_POLL_MS);
    return () => { clearInterval(chainTimer); clearInterval(roundTimer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh bet info whenever the derived opnet address changes
  useEffect(() => {
    if (opnetAddress) refreshBetInfo(opnetAddress);
    else { setBetInfo(null); setPendingWithdrawal(0n); }
  }, [opnetAddress, refreshBetInfo]);

  // ── Bet placement ───────────────────────────────────────────────────────────

  const placeBet = useCallback(async (side: BetSide, amountBtc: string) => {
    if (!account) throw new Error('Wallet not connected');
    setIsBetting(true);
    setTxError(null);
    try {
      const isEven    = side === 'even';
      const valueSats = btcToSats(amountBtc);
      if (valueSats <= 0) throw new Error('Invalid bet amount');

      // Calldata: bool(isEven) + uint64(betSatoshis)
      const result = await contractCall(
        SELECTORS.bet,
        [encodeBool(isEven), encodeU64(valueSats)],
        valueSats, // also attach the BTC to the tx
      );
      setLastTxId(result.txid);

      setTimeout(() => {
        refreshRoundInfo();
        if (opnetAddress) refreshBetInfo(opnetAddress);
      }, 3_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsBetting(false);
    }
  }, [account, opnetAddress, refreshRoundInfo, refreshBetInfo]);

  // ── Settlement ──────────────────────────────────────────────────────────────

  const settle = useCallback(async () => {
    if (!account) throw new Error('Wallet not connected');
    setIsSettling(true);
    setTxError(null);
    try {
      // settle() takes no arguments — the contract reads the block hash internally.
      const result = await contractCall(SELECTORS.settle, [], 0);
      setLastTxId(result.txid);
      setTimeout(() => refreshRoundInfo(), 5_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsSettling(false);
    }
  }, [account, refreshRoundInfo]);

  // ── Claim ───────────────────────────────────────────────────────────────────

  const claim = useCallback(async () => {
    if (!account) throw new Error('Wallet not connected');
    setIsClaiming(true);
    setTxError(null);
    try {
      const result = await contractCall(SELECTORS.claim, [], 0);
      setLastTxId(result.txid);
      setTimeout(() => {
        refreshRoundInfo();
        if (opnetAddress) refreshBetInfo(opnetAddress);
      }, 5_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsClaiming(false);
    }
  }, [account, opnetAddress, refreshRoundInfo, refreshBetInfo]);

  // ── Withdraw ────────────────────────────────────────────────────────────────

  const withdraw = useCallback(async () => {
    if (!account) throw new Error('Wallet not connected');
    setIsWithdrawing(true);
    setTxError(null);
    try {
      const result = await contractCall(SELECTORS.withdraw, [], 0);
      setLastTxId(result.txid);
      setTimeout(() => {
        if (opnetAddress) refreshBetInfo(opnetAddress);
      }, 5_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsWithdrawing(false);
    }
  }, [account, opnetAddress, refreshBetInfo]);

  // ── Set treasury ────────────────────────────────────────────────────────────

  const setTreasury = useCallback(async (addressBytes: Uint8Array) => {
    if (!account) throw new Error('Wallet not connected');
    setTxError(null);
    try {
      const result = await contractCall(SELECTORS.setTreasury, [encodeOpnetAddress(addressBytes)], 0);
      setLastTxId(result.txid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    }
  }, [account]);

  // ── Start new round ─────────────────────────────────────────────────────────

  const startNewRound = useCallback(async () => {
    if (!account) throw new Error('Wallet not connected');
    setIsStartingNewRound(true);
    setTxError(null);
    try {
      const result = await contractCall(SELECTORS.startNewRound, [], 0);
      setLastTxId(result.txid);
      setTimeout(() => refreshRoundInfo(), 5_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
      throw err;
    } finally {
      setIsStartingNewRound(false);
    }
  }, [account, refreshRoundInfo]);

  return {
    // State
    account,
    opnetAddress,
    isConnecting,
    walletError,
    roundInfo,
    betInfo,
    isLoadingRound,
    pendingWithdrawal,
    chainTip,
    secondsToBlock,
    isBetting,
    isSettling,
    isClaiming,
    isWithdrawing,
    isStartingNewRound,
    txError,
    lastTxId,
    // Actions
    connectWallet,
    disconnectWallet,
    placeBet,
    settle,
    claim,
    withdraw,
    startNewRound,
    setTreasury,
    refreshRoundInfo,
  };
}
