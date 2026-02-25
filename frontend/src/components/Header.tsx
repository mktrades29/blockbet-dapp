import { Bitcoin, Wallet, LogOut, ExternalLink } from 'lucide-react';
import type { OPWalletAccount } from '../types/opwallet';

interface HeaderProps {
  account:       OPWalletAccount | null;
  isConnecting:  boolean;
  onConnect:     () => void;
  onDisconnect:  () => void;
}

export default function Header({ account, isConnecting, onConnect, onDisconnect }: HeaderProps) {
  const shortAddress = account
    ? `${account.address.slice(0, 6)}…${account.address.slice(-6)}`
    : null;

  return (
    <header className="sticky top-0 z-50 border-b border-dark-600/50 bg-dark-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-btc-gradient shadow-lg">
            <Bitcoin className="h-6 w-6 text-black" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-xl ring-1 ring-btc-orange/30 animate-pulse-slow" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-neon-orange">
              BlockBet
            </h1>
            <p className="text-[10px] font-mono text-gray-500 tracking-widest uppercase">
              Bitcoin L1 · OP_NET
            </p>
          </div>
        </div>

        {/* Network badge */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-dark-500 bg-dark-800 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-neon-green animate-pulse" />
          <span className="text-xs font-mono text-gray-400">Bitcoin Mainnet</span>
        </div>

        {/* Wallet button */}
        {account ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-dark-500 bg-dark-800 px-3 py-2">
              <div className="h-2 w-2 rounded-full bg-neon-green" />
              <span className="font-mono text-sm text-gray-300">{shortAddress}</span>
              <a
                href={`https://mempool.space/address/${account.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-btc-orange transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <button
              onClick={onDisconnect}
              className="flex items-center gap-2 rounded-xl border border-dark-500 bg-dark-800 px-3 py-2
                         text-sm text-gray-400 hover:border-red-500/50 hover:text-red-400 transition-all"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:block">Disconnect</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="btn-btc px-5 py-2.5 text-sm"
          >
            <Wallet className="h-4 w-4" />
            {isConnecting ? 'Connecting…' : 'Connect OPWallet'}
          </button>
        )}
      </div>
    </header>
  );
}
