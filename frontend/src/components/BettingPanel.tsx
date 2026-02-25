import { useState } from 'react';
import { Zap, AlertTriangle, CheckCircle, ExternalLink, RefreshCw, Trophy, ArrowDownToLine, RotateCw } from 'lucide-react';
import type { BetSide } from '../hooks/useBlockBet';
import type { RoundInfo, BetInfo } from '../utils/opnet';
import { satsToBtc } from '../utils/opnet';

interface BettingPanelProps {
  account:            { address: string } | null;
  roundInfo:          RoundInfo | null;
  betInfo:            BetInfo   | null;
  pendingWithdrawal:  bigint;
  isBetting:          boolean;
  isSettling:         boolean;
  isClaiming:         boolean;
  isWithdrawing:      boolean;
  isStartingNewRound: boolean;
  txError:            string | null;
  lastTxId:           string | null;
  onBet:              (side: BetSide, amountBtc: string) => Promise<void>;
  onSettle:           () => Promise<void>;
  onClaim:            () => Promise<void>;
  onWithdraw:         () => Promise<void>;
  onStartNewRound:    () => Promise<void>;
  onConnect:          () => void;
}

const PRESET_AMOUNTS = ['0.0001', '0.0005', '0.001', '0.005'];

export default function BettingPanel({
  account,
  roundInfo,
  betInfo,
  pendingWithdrawal,
  isBetting,
  isSettling,
  isClaiming,
  isWithdrawing,
  isStartingNewRound,
  txError,
  lastTxId,
  onBet,
  onSettle,
  onClaim,
  onWithdraw,
  onStartNewRound,
  onConnect,
}: BettingPanelProps) {
  const [amount,   setAmount]   = useState('0.0001');
  const [selected, setSelected] = useState<BetSide | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const settled      = roundInfo?.settled ?? false;
  const targetBlock  = roundInfo ? Number(roundInfo.targetBlock)  : null;
  // Use currentBlock from the OP_NET node (returned by getRoundInfo) — not the
  // mempool.space mainnet height, which would be ~880 000 vs regtest's ~100.
  const currentBlock = roundInfo ? Number(roundInfo.currentBlock) : null;
  const bettingOpen  = !settled && targetBlock !== null && currentBlock !== null && currentBlock < targetBlock;
  const awaitSettle  = !settled && targetBlock !== null && currentBlock !== null && currentBlock >= targetBlock;
  const winnerSide  = roundInfo?.winnerSide ?? 0;

  const hasWinningBet = betInfo && (
    (winnerSide === 1 && betInfo.evenBet > 0n) ||
    (winnerSide === 2 && betInfo.oddBet  > 0n)
  );
  const canClaim    = settled && hasWinningBet && !betInfo?.claimed;
  const canWithdraw = pendingWithdrawal > 0n;
  const canNewRound = settled && !canClaim;

  async function handleBet(side: BetSide) {
    setLocalErr(null);
    if (!account) { onConnect(); return; }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setLocalErr('Enter a valid BTC amount');
      return;
    }
    setSelected(side);
    try {
      await onBet(side, amount);
    } catch {
      // error stored in txError from hook
    }
  }

  const isBusy = isBetting || isSettling || isClaiming || isWithdrawing || isStartingNewRound;

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <Zap className="h-4 w-4 text-btc-orange" />
        <span className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          Place Your Bet
        </span>
      </div>

      {/* ── Betting UI ── */}
      {bettingOpen && (
        <>
          <div className="mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-500">
              Bet Amount (BTC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setLocalErr(null); }}
                step="0.0001"
                min="0.0001"
                placeholder="0.0001"
                className="w-full rounded-xl border border-dark-500 bg-dark-700 px-4 py-3
                           font-mono text-lg text-white placeholder-gray-600
                           focus:border-btc-orange/50 focus:outline-none focus:ring-1 focus:ring-btc-orange/30
                           transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                BTC
              </span>
            </div>

            <div className="mt-2 flex gap-2">
              {PRESET_AMOUNTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-mono transition-all
                    ${amount === p
                      ? 'border-btc-orange/50 bg-btc-orange/10 text-btc-orange'
                      : 'border-dark-500 bg-dark-700 text-gray-500 hover:border-dark-400 hover:text-gray-300'
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <p className="mb-4 text-center text-xs font-mono text-gray-600">
            ≈ {(parseFloat(amount || '0') * 1e8).toFixed(0)} sats · min 10,000 sats
          </p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleBet('even')}
              disabled={isBusy}
              className="btn-even py-6 text-xl relative group"
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity
                              bg-gradient-to-r from-transparent via-white/10 to-transparent
                              -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%]
                              duration-700 pointer-events-none" />
              {isBetting && selected === 'even' ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : null}
              <span className="relative z-10">
                <span className="block text-2xl leading-none">⬡ EVEN</span>
                <span className="block text-xs font-normal opacity-75 mt-1">last nibble 0,2,4,6,8,a,c,e</span>
              </span>
            </button>

            <button
              onClick={() => handleBet('odd')}
              disabled={isBusy}
              className="btn-odd py-6 text-xl relative group"
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity
                              bg-gradient-to-r from-transparent via-white/10 to-transparent
                              -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%]
                              duration-700 pointer-events-none" />
              {isBetting && selected === 'odd' ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : null}
              <span className="relative z-10">
                <span className="block text-2xl leading-none">◈ ODD</span>
                <span className="block text-xs font-normal opacity-75 mt-1">last nibble 1,3,5,7,9,b,d,f</span>
              </span>
            </button>
          </div>

          {!account && (
            <p className="mt-3 text-center text-xs text-gray-500">
              Clicking will prompt wallet connection
            </p>
          )}
        </>
      )}

      {/* ── Awaiting settlement ── */}
      {awaitSettle && (
        <div className="space-y-4">
          <div className="rounded-xl border border-btc-orange/30 bg-btc-orange/5 p-4 text-center">
            <Zap className="mx-auto mb-2 h-6 w-6 text-btc-orange animate-pulse" />
            <p className="font-bold text-btc-orange">Block #{targetBlock} Mined!</p>
            <p className="mt-1 text-xs text-gray-400">
              The target block has been mined. Settle to reveal the winner.
            </p>
          </div>
          <button
            onClick={onSettle}
            disabled={isBusy || !account}
            className="btn-btc w-full py-4 text-lg"
          >
            {isSettling ? (
              <><RefreshCw className="h-5 w-5 animate-spin" /> Settling…</>
            ) : (
              <><Zap className="h-5 w-5" /> Settle Round</>
            )}
          </button>
          {!account && (
            <p className="text-center text-xs text-gray-500">Connect wallet to settle</p>
          )}
        </div>
      )}

      {/* ── Claim winnings ── */}
      {canClaim && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 text-center
            ${winnerSide === 1
              ? 'border-neon-green/30 bg-neon-green/5'
              : 'border-neon-red/30 bg-neon-red/5'
            }`}>
            <Trophy className={`mx-auto mb-2 h-7 w-7
              ${winnerSide === 1 ? 'text-neon-green' : 'text-neon-red'}`} />
            <p className={`font-black text-lg
              ${winnerSide === 1 ? 'text-neon-green' : 'text-neon-red'}`}>
              You Won!
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Bet:{' '}
              {betInfo && winnerSide === 1
                ? `${satsToBtc(betInfo.evenBet)} BTC EVEN`
                : `${satsToBtc(betInfo!.oddBet)} BTC ODD`}
            </p>
          </div>
          <button
            onClick={onClaim}
            disabled={isBusy}
            className="btn-btc w-full py-4 text-lg"
          >
            {isClaiming ? (
              <><RefreshCw className="h-5 w-5 animate-spin" /> Claiming…</>
            ) : (
              <><Trophy className="h-5 w-5" /> Claim Winnings</>
            )}
          </button>
        </div>
      )}

      {/* ── Withdraw pending balance ── */}
      {canWithdraw && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-btc-orange/30 bg-btc-orange/5 p-3 text-center">
            <p className="text-xs text-gray-400">Pending withdrawal</p>
            <p className="font-mono font-bold text-btc-orange">
              {satsToBtc(pendingWithdrawal)} BTC
            </p>
          </div>
          <button
            onClick={onWithdraw}
            disabled={isBusy}
            className="btn-btc w-full py-3"
          >
            {isWithdrawing ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Withdrawing…</>
            ) : (
              <><ArrowDownToLine className="h-4 w-4" /> Withdraw {satsToBtc(pendingWithdrawal)} BTC</>
            )}
          </button>
        </div>
      )}

      {/* ── Round settled, start next round ── */}
      {canNewRound && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-dark-500 bg-dark-700 p-3 text-center">
            {betInfo?.claimed ? (
              <><CheckCircle className="mx-auto mb-1 h-5 w-5 text-neon-green" />
                <p className="text-sm font-semibold text-gray-300">Winnings claimed</p></>
            ) : betInfo && (betInfo.evenBet > 0n || betInfo.oddBet > 0n) ? (
              <><AlertTriangle className="mx-auto mb-1 h-5 w-5 text-gray-500" />
                <p className="text-sm text-gray-500">Better luck next round</p></>
            ) : (
              <p className="text-sm text-gray-500">Round settled — start a new one</p>
            )}
          </div>
          <button
            onClick={onStartNewRound}
            disabled={isBusy || !account}
            className="w-full rounded-xl border border-dark-400 bg-dark-700 py-3
                       text-sm font-semibold text-gray-300 hover:border-btc-orange/40
                       hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isStartingNewRound ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <><RotateCw className="h-4 w-4" /> Start New Round</>
            )}
          </button>
        </div>
      )}

      {/* ── Wallet not connected ── */}
      {!account && !bettingOpen && !awaitSettle && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-gray-500">Connect your wallet to participate</p>
          <button onClick={onConnect} className="btn-btc w-full py-3">
            Connect OPWallet
          </button>
        </div>
      )}

      {/* ── Error / TX notification ── */}
      {(localErr || txError) && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{localErr || txError}</p>
        </div>
      )}

      {lastTxId && !txError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-neon-green/20 bg-neon-green/5 p-3">
          <CheckCircle className="h-4 w-4 shrink-0 text-neon-green" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-neon-green">Transaction broadcast!</p>
            <a
              href={`https://mempool.space/tx/${lastTxId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              <span className="truncate font-mono">{lastTxId.slice(0, 20)}…</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
      )}

      <div className="mt-5 divider-glow" />
      <p className="mt-4 text-center text-[10px] leading-relaxed text-gray-600">
        Parity determined by the last hex nibble of the settled block hash.
        2% house fee · Non-custodial · Runs on Bitcoin L1 via OP_NET.
      </p>
    </div>
  );
}
