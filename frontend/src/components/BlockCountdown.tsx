import { Clock, Zap, Hash } from 'lucide-react';
import type { RoundInfo } from '../utils/opnet';
import type { BlockTip } from '../utils/opnet';

interface BlockCountdownProps {
  secondsToBlock: number;
  chainTip:       BlockTip | null;
  roundInfo:      RoundInfo | null;
}

function formatTime(totalSeconds: number): { mm: string; ss: string } {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return {
    mm: String(m).padStart(2, '0'),
    ss: String(s).padStart(2, '0'),
  };
}

function getUrgencyClass(seconds: number): string {
  if (seconds < 60)  return 'text-neon-red';
  if (seconds < 180) return 'text-btc-orange';
  return 'text-neon-green';
}

export default function BlockCountdown({ secondsToBlock, chainTip, roundInfo }: BlockCountdownProps) {
  const { mm, ss } = formatTime(secondsToBlock);
  const urgency    = getUrgencyClass(secondsToBlock);
  const progress   = Math.max(0, Math.min(1, 1 - secondsToBlock / 600));

  // Determine round status label
  const settled = roundInfo?.settled ?? false;
  const targetBlock = roundInfo ? Number(roundInfo.targetBlock) : null;
  const currentBlock = chainTip?.height ?? 0;
  const isAwaitingSettle = settled === false && targetBlock !== null && currentBlock >= targetBlock;

  return (
    <div className="card-glow p-6">
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Next Block
          </span>
        </div>
        {chainTip && (
          <div className="flex items-center gap-1.5 rounded-full bg-dark-700 px-3 py-1">
            <Hash className="h-3 w-3 text-gray-500" />
            <span className="font-mono text-xs text-gray-400">
              {chainTip.height.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Countdown digits */}
      <div className={`mono-display text-center ${urgency} transition-colors duration-500`}>
        <div className="flex items-center justify-center gap-2">
          {/* Minutes */}
          <div className="flex flex-col items-center">
            <div className="rounded-xl bg-dark-700 px-4 py-2 text-5xl font-black tabular-nums leading-none">
              {mm}
            </div>
            <span className="mt-1 text-[10px] uppercase tracking-widest text-gray-600">min</span>
          </div>

          {/* Separator */}
          <div className={`mb-6 text-4xl font-black ${urgency} animate-pulse`}>:</div>

          {/* Seconds */}
          <div className="flex flex-col items-center">
            <div className="rounded-xl bg-dark-700 px-4 py-2 text-5xl font-black tabular-nums leading-none">
              {ss}
            </div>
            <span className="mt-1 text-[10px] uppercase tracking-widest text-gray-600">sec</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-600">
          <div
            className="h-full rounded-full bg-btc-gradient transition-all duration-1000"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-mono text-gray-600">
          <span>last block</span>
          <span>~10 min avg</span>
        </div>
      </div>

      {/* Status strip */}
      <div className="mt-4 divider-glow" />
      <div className="mt-4 flex items-center justify-between text-xs">
        {isAwaitingSettle ? (
          <div className="flex items-center gap-2 text-btc-orange">
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            <span className="font-semibold">Block mined! Awaiting settlement…</span>
          </div>
        ) : settled ? (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-600" />
            <span>Round settled · New round open</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-neon-green">
            <span className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
            <span className="font-semibold">Betting window open</span>
          </div>
        )}
        {targetBlock && (
          <span className="font-mono text-gray-600">
            target: #{targetBlock.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
