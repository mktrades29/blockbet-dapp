import { AlertTriangle, Github, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';
import { useBlockBet } from './hooks/useBlockBet';
import { toHex } from './utils/opnet';
import Header        from './components/Header';
import BlockCountdown from './components/BlockCountdown';
import PoolDisplay   from './components/PoolDisplay';
import BettingPanel  from './components/BettingPanel';

// Deployer's OP_NET address — only this wallet sees the treasury admin panel.
// Set VITE_DEPLOYER_ADDRESS in Vercel environment variables.
const DEPLOYER_OPNET_ADDRESS =
  (import.meta.env.VITE_DEPLOYER_ADDRESS as string) || '';

export default function App() {
  const {
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
  } = useBlockBet();

  const [treasuryTx,  setTreasuryTx]  = useState<string | null>(null);
  const [treasuryErr, setTreasuryErr] = useState<string | null>(null);
  const [settingTreasury, setSettingTreasury] = useState(false);

  async function handleSetTreasury() {
    if (!opnetAddress) return;
    setSettingTreasury(true);
    setTreasuryErr(null);
    setTreasuryTx(null);
    try {
      await setTreasury(opnetAddress);
      setTreasuryTx('Treasury updated to your address!');
    } catch (err: unknown) {
      setTreasuryErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingTreasury(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-dark-900">
      <Header
        account={account}
        isConnecting={isConnecting}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
      />

      {/* Wallet error banner */}
      {walletError && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center text-sm">
          <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-400" />
          <span className="text-amber-300">
            {walletError.includes('not detected') ? (
              <>
                OPWallet not detected.{' '}
                <a
                  href="https://opwallet.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white transition-colors"
                >
                  Install OPWallet
                </a>{' '}
                to place bets.
              </>
            ) : (
              walletError
            )}
          </span>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">

        {/* Hero */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Will the next block be{' '}
            <span className="text-neon-green">EVEN</span>
            {' or '}
            <span className="text-neon-red">ODD</span>?
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Bet on the parity of the last hex nibble of the next Bitcoin block hash.
            Fully on-chain · Non-custodial · OP_NET on Bitcoin L1.
          </p>
        </div>

        {/* Loading skeleton */}
        {isLoadingRound && !roundInfo && (
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Syncing contract state…</span>
          </div>
        )}

        {/* Main dashboard grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* Left column: countdown + pool */}
          <div className="flex flex-col gap-5 lg:col-span-2">
            <BlockCountdown
              secondsToBlock={secondsToBlock}
              chainTip={chainTip}
              roundInfo={roundInfo}
            />
            <PoolDisplay
              roundInfo={roundInfo}
              betInfo={betInfo}
              isLoading={isLoadingRound}
            />
          </div>

          {/* Right column: betting panel */}
          <div className="lg:col-span-1">
            <BettingPanel
              account={account}
              roundInfo={roundInfo}
              betInfo={betInfo}
              pendingWithdrawal={pendingWithdrawal}
              isBetting={isBetting}
              isSettling={isSettling}
              isClaiming={isClaiming}
              isWithdrawing={isWithdrawing}
              isStartingNewRound={isStartingNewRound}
              txError={txError}
              lastTxId={lastTxId}

              onBet={placeBet}
              onSettle={settle}
              onClaim={claim}
              onWithdraw={withdraw}
              onStartNewRound={startNewRound}
              onConnect={connectWallet}
            />
          </div>
        </div>

        {/* ── Treasury / Admin (deployer only) ── */}
        {account && opnetAddress && toHex(opnetAddress) === DEPLOYER_OPNET_ADDRESS && (
          <section className="mt-10">
            <div className="divider-glow mb-6" />
            <div className="mx-auto max-w-lg card-glow p-5">
              <div className="mb-3 flex items-center gap-2">
                <Settings className="h-4 w-4 text-btc-orange" />
                <span className="text-sm font-semibold uppercase tracking-widest text-gray-500">
                  House Fee Treasury
                </span>
              </div>
              <p className="mb-1 text-xs text-gray-500">
                Your OP_NET address (receives the 2% house fee):
              </p>
              <p className="mb-4 break-all font-mono text-xs text-gray-300 rounded-lg bg-dark-800 border border-dark-500 px-3 py-2">
                {toHex(opnetAddress)}
              </p>
              <p className="mb-3 text-xs text-gray-600">
                The treasury was set to the deployer address at deployment. Click below to confirm
                it is pointing to your current wallet.
              </p>
              <button
                onClick={handleSetTreasury}
                disabled={settingTreasury}
                className="w-full rounded-xl border border-btc-orange/40 bg-btc-orange/10 py-2.5
                           text-sm font-semibold text-btc-orange hover:bg-btc-orange/20
                           transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {settingTreasury ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Setting treasury…</>
                ) : (
                  <><Settings className="h-4 w-4" /> Set Treasury to My Address</>
                )}
              </button>
              {treasuryTx && (
                <p className="mt-2 text-center text-xs text-neon-green">{treasuryTx}</p>
              )}
              {treasuryErr && (
                <p className="mt-2 text-center text-xs text-red-400">{treasuryErr}</p>
              )}
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="mt-12">
          <div className="divider-glow mb-8" />
          <h3 className="mb-6 text-center text-xl font-black uppercase tracking-widest text-gray-500">
            How It Works
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="card-glow p-5 text-center">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full
                                bg-btc-orange/10 text-btc-orange font-black text-lg">
                  {i + 1}
                </div>
                <h4 className="mb-1 font-bold text-white">{step.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Refresh button */}
        <div className="mt-8 text-center">
          <button
            onClick={refreshRoundInfo}
            disabled={isLoadingRound}
            className="inline-flex items-center gap-2 rounded-xl border border-dark-500 bg-dark-800
                       px-4 py-2 text-sm text-gray-400 hover:border-dark-400 hover:text-gray-200
                       transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingRound ? 'animate-spin' : ''}`} />
            Refresh Round Data
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-dark-600/50 px-6 py-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-600">
          <span>BlockBet · Bitcoin L1 · OP_NET</span>
          <span className="h-1 w-1 rounded-full bg-dark-500" />
          <span>2% house fee · Non-custodial</span>
          <span className="h-1 w-1 rounded-full bg-dark-500" />
          <a
            href="https://github.com/your-org/blockbet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-gray-400 transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    title: 'Connect Wallet',
    desc:  'Install OPWallet and connect your Bitcoin address to the dApp.',
  },
  {
    title: 'Place Your Bet',
    desc:  'Choose EVEN or ODD and send BTC. Your bet joins the on-chain pool.',
  },
  {
    title: 'Block Mines',
    desc:  'The target Bitcoin block is mined. Anyone can call settle() on-chain.',
  },
  {
    title: 'Claim Winnings',
    desc:  'Winners claim proportional payouts from the entire pool minus a 2% fee.',
  },
];
