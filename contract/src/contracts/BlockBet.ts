/**
 * BlockBet — OP_NET Smart Contract (v1.10.12-compatible)
 *
 * A decentralized betting contract on Bitcoin L1 via OP_NET.
 * Players bet on whether the last nibble (hex digit) of the next Bitcoin
 * block hash is EVEN (0,2,4,6,8,a,c,e) or ODD (1,3,5,7,9,b,d,f).
 *
 * Round lifecycle:
 *   1. OPEN     – bets accepted for the current target block.
 *   2. PENDING  – target block has been mined; awaiting settle() call.
 *   3. SETTLED  – winnings recorded; winners call claim() then withdraw().
 *
 * Compiled with AssemblyScript via `npm run build` in the /contract folder.
 * Deployed to Bitcoin L1 via the OP_NET CLI / btc-vision toolchain.
 *
 * NOTE on BTC transfers: OP_NET v1 has no host-level transfer() call.
 * Payouts are tracked in a `claimable` map. The OP_NET protocol node reads
 * these amounts to construct the actual UTXO outputs for winners.
 * Users call withdraw() to zero-out their claimable record and signal the
 * protocol to send them their BTC.
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
  Address,
  AddressMemoryMap,
  Blockchain,
  BytesWriter,
  Calldata,
  EMPTY_POINTER,
  encodeSelector,
  NetEvent,
  OP_NET,
  Revert,
  SafeMath,
  Selector,
  StoredAddress,
  StoredBoolean,
  StoredU256,
} from '@btc-vision/btc-runtime/runtime';

// ─── Storage slot pointers (must be unique per contract) ──────────────────────
const PTR_ROUND_ID:        u16 = 0x0001;
const PTR_TARGET_BLOCK:    u16 = 0x0002;
const PTR_EVEN_POOL:       u16 = 0x0003;
const PTR_ODD_POOL:        u16 = 0x0004;
const PTR_SETTLED:         u16 = 0x0005;
const PTR_WINNER_SIDE:     u16 = 0x0006; // 0 = unknown, 1 = even, 2 = odd
const PTR_HOUSE_FEE_BPS:   u16 = 0x0007; // basis points, e.g. 200 = 2%
const PTR_TREASURY:        u16 = 0x0008;
const PTR_WINNING_BLOCK:   u16 = 0x0009;
// Per-address bet mappings
const PTR_BET_AMOUNT_EVEN: u16 = 0x0100; // address → u256 satoshis bet on EVEN
const PTR_BET_AMOUNT_ODD:  u16 = 0x0101; // address → u256 satoshis bet on ODD
const PTR_CLAIMED:         u16 = 0x0102; // address → u256 (0 = not claimed, 1 = claimed)
const PTR_CLAIMABLE:       u16 = 0x0103; // address → u256 pending satoshis to withdraw

// ─── Constants ────────────────────────────────────────────────────────────────
/** Minimum bet in satoshis (0.0001 BTC = 10_000 sats) */
const MIN_BET_SATS: u64 = 10_000;
/** How many blocks ahead to target for settlement */
const BLOCKS_AHEAD: u64 = 1;
/** House fee: 200 basis points = 2% */
const DEFAULT_FEE_BPS: u64 = 200;

// ─── Side constants ───────────────────────────────────────────────────────────
const SIDE_EVEN: u64 = 1;
const SIDE_ODD:  u64 = 2;

// ─── Concrete NetEvent subclasses ────────────────────────────────────────────

@final
class BetPlacedEvent extends NetEvent {
  constructor(caller: Address, isEven: bool, amount: u256) {
    const data = new BytesWriter(65); // 32 + 1 + 32
    data.writeAddress(caller);
    data.writeBoolean(isEven);
    data.writeU256(amount);
    super('BetPlaced', data);
  }
}

@final
class RoundSettledEvent extends NetEvent {
  constructor(targetBlock: u256, isEven: bool, evenPool: u256, oddPool: u256) {
    const data = new BytesWriter(97); // 32 + 1 + 32 + 32
    data.writeU256(targetBlock);
    data.writeBoolean(isEven);
    data.writeU256(evenPool);
    data.writeU256(oddPool);
    super('RoundSettled', data);
  }
}

@final
class WinningsClaimedEvent extends NetEvent {
  constructor(caller: Address, betAmount: u256, netPayout: u256) {
    const data = new BytesWriter(96); // 32 + 32 + 32
    data.writeAddress(caller);
    data.writeU256(betAmount);
    data.writeU256(netPayout);
    super('WinningsClaimed', data);
  }
}

@final
class RoundOpenedEvent extends NetEvent {
  constructor(roundId: u256, targetBlock: u256) {
    const data = new BytesWriter(64); // 32 + 32
    data.writeU256(roundId);
    data.writeU256(targetBlock);
    super('RoundOpened', data);
  }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

@final
export class BlockBet extends OP_NET {

  // ── Persistent storage fields ─────────────────────────────────────────────

  private roundId:      StoredU256;
  private targetBlock:  StoredU256;
  private evenPool:     StoredU256;
  private oddPool:      StoredU256;
  private settled:      StoredBoolean;
  private winnerSide:   StoredU256;
  private houseFeeBps:  StoredU256;
  private treasury:     StoredAddress;
  private winningBlock: StoredU256;

  /** Per-address even-side bet amounts (satoshis as u256) */
  private betEven:   AddressMemoryMap;
  /** Per-address odd-side bet amounts (satoshis as u256) */
  private betOdd:    AddressMemoryMap;
  /** Per-address claim flags (u256.Zero = not claimed, u256.One = claimed) */
  private claimed:   AddressMemoryMap;
  /** Per-address pending withdrawal amounts (satoshis as u256) */
  private claimable: AddressMemoryMap;

  // ── OP_NET lifecycle ──────────────────────────────────────────────────────

  public constructor() {
    super();

    this.roundId      = new StoredU256(PTR_ROUND_ID,      EMPTY_POINTER);
    this.targetBlock  = new StoredU256(PTR_TARGET_BLOCK,  EMPTY_POINTER);
    this.evenPool     = new StoredU256(PTR_EVEN_POOL,     EMPTY_POINTER);
    this.oddPool      = new StoredU256(PTR_ODD_POOL,      EMPTY_POINTER);
    this.settled      = new StoredBoolean(PTR_SETTLED,    false);
    this.winnerSide   = new StoredU256(PTR_WINNER_SIDE,   EMPTY_POINTER);
    this.houseFeeBps  = new StoredU256(PTR_HOUSE_FEE_BPS, EMPTY_POINTER);
    this.treasury     = new StoredAddress(PTR_TREASURY);
    this.winningBlock = new StoredU256(PTR_WINNING_BLOCK, EMPTY_POINTER);

    this.betEven   = new AddressMemoryMap(PTR_BET_AMOUNT_EVEN);
    this.betOdd    = new AddressMemoryMap(PTR_BET_AMOUNT_ODD);
    this.claimed   = new AddressMemoryMap(PTR_CLAIMED);
    this.claimable = new AddressMemoryMap(PTR_CLAIMABLE);
  }

  /** Called once at deploy time to initialise contract state. */
  public override onDeployment(_calldata: Calldata): void {
    this.houseFeeBps.value = u256.fromU64(DEFAULT_FEE_BPS);
    this.treasury.value    = this.contractDeployer;
    this._openNewRound();
  }

  // ── Method dispatch ───────────────────────────────────────────────────────

  public override execute(method: Selector, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('bet(bool,uint64)'):
        return this._bet(calldata);

      case encodeSelector('settle()'):
        return this._settle();

      case encodeSelector('claim()'):
        return this._claim();

      case encodeSelector('withdraw()'):
        return this._withdraw();

      case encodeSelector('startNewRound()'):
        return this._startNewRound();

      case encodeSelector('getRoundInfo()'):
        return this._getRoundInfo();

      case encodeSelector('getBetInfo(address)'):
        return this._getBetInfo(calldata);

      case encodeSelector('getPendingWithdrawal(address)'):
        return this._getPendingWithdrawal(calldata);

      case encodeSelector('setTreasury(address)'):
        return this._setTreasury(calldata);

      case encodeSelector('setHouseFeeBps(uint64)'):
        return this._setHouseFeeBps(calldata);

      default:
        throw new Revert('BlockBet: unknown method selector');
    }
  }

  // ── bet(bool isEven, uint64 amount) ───────────────────────────────────────

  /**
   * Place a bet on the current round.
   * @param calldata  ABI-encoded: bool isEven, uint64 betSatoshis
   *
   * The user must also send the declared satoshi amount as BTC in their tx.
   * OP_NET verifies the transaction at the protocol level.
   */
  private _bet(calldata: Calldata): BytesWriter {
    if (this.settled.value) {
      throw new Revert('BlockBet: round already settled, call startNewRound()');
    }

    const currentBlock = Blockchain.block.numberU256;
    if (u256.gt(currentBlock, this.targetBlock.value)) {
      throw new Revert('BlockBet: betting window closed, call settle() first');
    }

    const isEven  = calldata.readBoolean();
    const betSats = calldata.readU64();
    const betU256 = u256.fromU64(betSats);

    if (betSats < MIN_BET_SATS) {
      throw new Revert('BlockBet: minimum bet is 10000 satoshis');
    }

    const caller = Blockchain.tx.sender;

    if (isEven) {
      const prev = this.betEven.get(caller);
      this.betEven.set(caller, SafeMath.add(prev, betU256));
      this.evenPool.value = SafeMath.add(this.evenPool.value, betU256);
    } else {
      const prev = this.betOdd.get(caller);
      this.betOdd.set(caller, SafeMath.add(prev, betU256));
      this.oddPool.value = SafeMath.add(this.oddPool.value, betU256);
    }

    this.emitEvent(new BetPlacedEvent(caller, isEven, betU256));

    const w = new BytesWriter(1);
    w.writeBoolean(true);
    return w;
  }

  // ── settle() ─────────────────────────────────────────────────────────────

  /**
   * Settle the current round.
   *
   * Anyone may call this once the target block has been mined.
   * The OP_NET runtime retrieves the canonical block hash via getBlockHash().
   * Parity is determined from the last nibble of the last raw hash byte.
   */
  private _settle(): BytesWriter {
    if (this.settled.value) {
      throw new Revert('BlockBet: round already settled');
    }

    const targetBlockNum = this.targetBlock.value;
    const currentBlock   = Blockchain.block.numberU256;
    if (u256.lt(currentBlock, targetBlockNum)) {
      throw new Revert('BlockBet: target block not yet mined');
    }

    // Retrieve canonical block hash from the OP_NET runtime (32 raw bytes).
    const hashBytes  = Blockchain.getBlockHash(targetBlockNum.toU64());
    // Last nibble = lower 4 bits of the last byte.
    const lastByte   = hashBytes[hashBytes.length - 1];
    const lastNibble = lastByte & 0x0F;
    const isEven     = (lastNibble % 2) === 0;

    this.winnerSide.value   = u256.fromU64(isEven ? SIDE_EVEN : SIDE_ODD);
    this.winningBlock.value = targetBlockNum;
    this.settled.value      = true;

    this.emitEvent(new RoundSettledEvent(
      targetBlockNum, isEven,
      this.evenPool.value, this.oddPool.value,
    ));

    const w = new BytesWriter(1);
    w.writeBoolean(true);
    return w;
  }

  // ── claim() ───────────────────────────────────────────────────────────────

  /**
   * Record winnings for the caller after the round is settled.
   * Proportional payout: winner's share = (their bet / winning pool) × total pool × (1 − fee).
   *
   * After claiming, call withdraw() to receive the actual BTC.
   */
  private _claim(): BytesWriter {
    if (!this.settled.value) {
      throw new Revert('BlockBet: round not yet settled');
    }

    const caller = Blockchain.tx.sender;

    if (!this.claimed.get(caller).isZero()) {
      throw new Revert('BlockBet: already claimed for this round');
    }

    const winnerSideU64 = this.winnerSide.value.toU64();
    const isEven        = winnerSideU64 === SIDE_EVEN;

    const callerBet   = isEven ? this.betEven.get(caller) : this.betOdd.get(caller);
    const winningPool = isEven ? this.evenPool.value       : this.oddPool.value;
    const losingPool  = isEven ? this.oddPool.value        : this.evenPool.value;

    if (callerBet.isZero()) {
      throw new Revert('BlockBet: no winning bet found for caller');
    }

    // grossPayout = (callerBet × totalPool) / winningPool
    const totalPool      = SafeMath.add(winningPool, losingPool);
    const grossNumerator = SafeMath.mul(callerBet, totalPool);
    const grossPayout    = SafeMath.div(grossNumerator, winningPool);

    // House fee
    const feeBps    = this.houseFeeBps.value;
    const feeAmount = SafeMath.div(SafeMath.mul(grossPayout, feeBps), u256.fromU64(10_000));
    const netPayout = SafeMath.sub(grossPayout, feeAmount);

    // Mark claimed
    this.claimed.set(caller, u256.One);

    // Record pending withdrawal for the winner
    const prevWinner = this.claimable.get(caller);
    this.claimable.set(caller, SafeMath.add(prevWinner, netPayout));

    // Record pending withdrawal for the treasury
    if (!feeAmount.isZero() && !this.treasury.isDead()) {
      const treasuryAddr = this.treasury.value;
      const prevTreasury = this.claimable.get(treasuryAddr);
      this.claimable.set(treasuryAddr, SafeMath.add(prevTreasury, feeAmount));
    }

    this.emitEvent(new WinningsClaimedEvent(caller, callerBet, netPayout));

    const w = new BytesWriter(32);
    w.writeU256(netPayout);
    return w;
  }

  // ── withdraw() ─────────────────────────────────────────────────────────────

  /**
   * Zero-out the caller's pending withdrawal record and return the amount.
   *
   * The OP_NET protocol node reads claimable amounts before execution and
   * constructs the corresponding UTXO output to send BTC to the caller.
   * This call confirms the withdrawal has been processed.
   */
  private _withdraw(): BytesWriter {
    const caller = Blockchain.tx.sender;
    const amount = this.claimable.get(caller);

    if (amount.isZero()) {
      throw new Revert('BlockBet: nothing to withdraw');
    }

    this.claimable.set(caller, u256.Zero);

    const w = new BytesWriter(32);
    w.writeU256(amount);
    return w;
  }

  // ── startNewRound() ────────────────────────────────────────────────────────

  /**
   * Open a new betting round. May be called by anyone after settlement.
   */
  private _startNewRound(): BytesWriter {
    if (!this.settled.value) {
      throw new Revert('BlockBet: current round not yet settled');
    }
    this._openNewRound();

    const w = new BytesWriter(1);
    w.writeBoolean(true);
    return w;
  }

  // ── getRoundInfo() ─────────────────────────────────────────────────────────

  /**
   * View: returns the current round's state.
   * Returns: roundId, targetBlock, evenPool, oddPool, settled, winnerSide, currentBlock, winningBlock
   */
  private _getRoundInfo(): BytesWriter {
    const w = new BytesWriter(256);
    w.writeU256(this.roundId.value);
    w.writeU256(this.targetBlock.value);
    w.writeU256(this.evenPool.value);
    w.writeU256(this.oddPool.value);
    w.writeBoolean(this.settled.value);
    w.writeU256(this.winnerSide.value);
    w.writeU256(Blockchain.block.numberU256);
    w.writeU256(this.winningBlock.value);
    return w;
  }

  // ── getBetInfo(address) ────────────────────────────────────────────────────

  /**
   * View: returns bet amounts for a given address in the current round.
   * Returns: evenBet (u256), oddBet (u256), claimed (bool)
   */
  private _getBetInfo(calldata: Calldata): BytesWriter {
    const addr = calldata.readAddress();

    const w = new BytesWriter(65); // 32 + 32 + 1
    w.writeU256(this.betEven.get(addr));
    w.writeU256(this.betOdd.get(addr));
    w.writeBoolean(!this.claimed.get(addr).isZero());
    return w;
  }

  // ── getPendingWithdrawal(address) ─────────────────────────────────────────

  /**
   * View: returns the pending withdrawal amount for a given address.
   * Returns: amount (u256)
   */
  private _getPendingWithdrawal(calldata: Calldata): BytesWriter {
    const addr = calldata.readAddress();

    const w = new BytesWriter(32);
    w.writeU256(this.claimable.get(addr));
    return w;
  }

  // ── setTreasury(address) ───────────────────────────────────────────────────

  private _setTreasury(calldata: Calldata): BytesWriter {
    this._onlyDeployer();
    const addr = calldata.readAddress();
    this.treasury.value = addr;

    const w = new BytesWriter(1);
    w.writeBoolean(true);
    return w;
  }

  // ── setHouseFeeBps(uint64) ─────────────────────────────────────────────────

  private _setHouseFeeBps(calldata: Calldata): BytesWriter {
    this._onlyDeployer();
    const bps = calldata.readU64();
    if (bps > 1_000) {
      throw new Revert('BlockBet: fee cannot exceed 10% (1000 bps)');
    }
    this.houseFeeBps.value = u256.fromU64(bps);

    const w = new BytesWriter(1);
    w.writeBoolean(true);
    return w;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Open a new betting round targeting `currentBlock + BLOCKS_AHEAD`. */
  private _openNewRound(): void {
    const nextRoundId  = SafeMath.add(this.roundId.value, u256.One);
    this.roundId.value = nextRoundId;

    const targetBlock      = SafeMath.add(Blockchain.block.numberU256, u256.fromU64(BLOCKS_AHEAD));
    this.targetBlock.value = targetBlock;

    this.evenPool.value     = u256.Zero;
    this.oddPool.value      = u256.Zero;
    this.settled.value      = false;
    this.winnerSide.value   = u256.Zero;
    this.winningBlock.value = u256.Zero;

    this.emitEvent(new RoundOpenedEvent(nextRoundId, targetBlock));
  }

  private _onlyDeployer(): void {
    if (Blockchain.tx.sender != this.contractDeployer) {
      throw new Revert('BlockBet: caller is not the contract deployer');
    }
  }
}
