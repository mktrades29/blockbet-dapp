import { TrendingUp, DollarSign } from 'lucide-react';
import type { RoundInfo, BetInfo } from '../utils/opnet';
import { satsToBtc } from '../utils/opnet';

interface PoolDisplayProps {
  roundInfo: RoundInfo | null;
  betInfo:   BetInfo | null;
  isLoading: boolean;
}

function PoolBar({ evenPct, oddPct }: { evenPct: number; oddPct: number }) {
  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-dark-600">
      {/* Even side (left, green) */}
      <div
        className="absolute left-0 top-0 h-full rounded-l-full bg-gradient-to-r from-neon-green-dark to-neon-green transition-all duration-700"
        style={{ width: `${evenPct}%` }}
      />
      {/* Odd side (right, red) */}
      <div
        className="absolute right-0 top-0 h-full rounded-r-full bg-gradient-to-l from-neon-red-dark to-neon-red transition-all duration-700"
        style={{ width: `${oddPct}%` }}
      />
      {/* Center divider */}
      <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-dark-900/60" />
    </div>
  );
}

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent: 'green' | 'red' | 'orange';
}) {
  const accentMap = {
    green:  'text-neon-green border-neon-green/20 bg-neon-green/5',
    red:    'text-neon-red border-neon-red/20 bg-neon-red/5',
    orange: 'text-btc-orange border-btc-orange/20 bg-btc-orange/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]}`}>
      <p className="text-xs font-semibold uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] opacity-50 font-mono">{sub}</p>}
    </div>
  );
}

export default function PoolDisplay({ roundInfo, betInfo, isLoading }: PoolDisplayProps) {
  const evenPool  = roundInfo?.evenPool  ?? 0n;
  const oddPool   = roundInfo?.oddPool   ?? 0n;
  const totalPool = evenPool + oddPool;

  const evenPct = totalPool > 0n
    ? Number((evenPool * 10000n) / totalPool) / 100
    : 50;
  const oddPct = totalPool > 0n
    ? Number((oddPool * 10000n) / totalPool) / 100
    : 50;

  const roundId    = roundInfo ? Number(roundInfo.roundId) : '—';
  const settled    = roundInfo?.settled ?? false;
  const winnerSide = roundInfo?.winnerSide ?? 0;

  const totalBtc  = satsToBtc(totalPool);
  const evenBtc   = satsToBtc(evenPool);
  const oddBtc    = satsToBtc(oddPool);

  // My position
  const myEvenBet = betInfo ? satsToBtc(betInfo.evenBet) : null;
  const myOddBet  = betInfo ? satsToBtc(betInfo.oddBet)  : null;
  const hasBet    = betInfo && (betInfo.evenBet > 0n || betInfo.oddBet > 0n);

  // Estimated payout if user wins (gross, before fee)
  const estimatePayout = (userBet: bigint, pool: bigint): string => {
    if (pool === 0n || userBet === 0n) return '—';
    const gross = (userBet * totalPool) / pool;
    return `~${satsToBtc(gross)} BTC`;
  };

  return (
    <div className="card-glow p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Current Pool
          </span>
        </div>
        <div className="flex items-center gap-2">
          {settled ? (
            <span className="badge badge-settled">Round {roundId} · Settled</span>
          ) : (
            <span className="badge badge-open">Round {roundId} · Live</span>
          )}
        </div>
      </div>

      {/* Total pool */}
      <div className="mb-5 text-center">
        {isLoading && !roundInfo ? (
          <div className="mx-auto h-12 w-32 animate-pulse rounded-lg bg-dark-600" />
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <DollarSign className="h-5 w-5 text-btc-orange" />
              <span className="font-mono text-4xl font-black text-neon-orange">
                {totalBtc}
              </span>
              <span className="text-lg font-semibold text-gray-500">BTC</span>
            </div>
            <p className="mt-1 text-xs text-gray-600 font-mono">
              {Number(totalPool).toLocaleString()} sats total
            </p>
          </>
        )}
      </div>

      {/* Pool split bar */}
      <PoolBar evenPct={evenPct} oddPct={oddPct} />
      <div className="mt-2 flex justify-between text-xs font-mono text-gray-500">
        <span>EVEN {evenPct.toFixed(1)}%</span>
        <span>ODD {oddPct.toFixed(1)}%</span>
      </div>

      {/* EVEN vs ODD stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Even Pool"
          value={`${evenBtc} BTC`}
          sub={`${evenPct.toFixed(1)}% of total`}
          accent="green"
        />
        <StatCard
          label="Odd Pool"
          value={`${oddBtc} BTC`}
          sub={`${oddPct.toFixed(1)}% of total`}
          accent="red"
        />
      </div>

      {/* Winner announcement */}
      {settled && winnerSide !== 0 && (
        <div className={`mt-4 rounded-xl p-3 text-center font-black text-lg border
          ${winnerSide === 1
            ? 'bg-neon-green/10 border-neon-green/30 text-neon-green'
            : 'bg-neon-red/10 border-neon-red/30 text-neon-red'
          }`}>
          {winnerSide === 1 ? '⬡ EVEN WINS' : '◈ ODD WINS'}
        </div>
      )}

      {/* My position */}
      {hasBet && (
        <>
          <div className="mt-5 divider-glow" />
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-600">
              My Position
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {betInfo!.evenBet > 0n && (
                <div className="rounded-lg bg-neon-green/5 border border-neon-green/15 p-2.5">
                  <span className="text-gray-500">Even bet:</span>
                  <span className="ml-1 text-neon-green font-semibold">{myEvenBet} BTC</span>
                  <div className="mt-0.5 text-gray-600">
                    {estimatePayout(betInfo!.evenBet, evenPool)}
                  </div>
                </div>
              )}
              {betInfo!.oddBet > 0n && (
                <div className="rounded-lg bg-neon-red/5 border border-neon-red/15 p-2.5">
                  <span className="text-gray-500">Odd bet:</span>
                  <span className="ml-1 text-neon-red font-semibold">{myOddBet} BTC</span>
                  <div className="mt-0.5 text-gray-600">
                    {estimatePayout(betInfo!.oddBet, oddPool)}
                  </div>
                </div>
              )}
            </div>
            {betInfo!.claimed && (
              <p className="mt-2 text-center text-xs text-gray-600">✓ Winnings claimed</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
