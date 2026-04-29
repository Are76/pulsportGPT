export type Chain = 'pulsechain' | 'ethereum' | 'base';

export interface Wallet {
  address: string;
  name: string;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  address?: string;
  balance: number;
  stakedBalance?: number;
  price: number;
  value: number;
  stakedValue?: number;
  chain: Chain;
  logoUrl?: string;
  pnl24h?: number;
  priceChange24h?: number;
  priceChange1h?: number;
  priceChange7d?: number;
  isCore?: boolean;
  isBridged?: boolean;
  entryPls?: number;
}

export interface InvestmentSourceAttribution {
  asset: 'ETH' | 'USDC' | 'DAI' | 'USDT' | string;
  chain: Chain;
  amountUsd: number;
}

export interface InvestmentHoldingRow {
  id: string;
  symbol: string;
  name: string;
  chain: Chain;
  address?: string;
  logoUrl?: string;
  amount: number;
  currentPrice: number;
  priceChange24h?: number;
  currentValue: number;
  costBasis: number;
  pnlUsd: number;
  pnlPercent: number;
  sourceMix: InvestmentSourceAttribution[];
  routeSummary: string;
  thenValue: number;
  nowValue: number;
}

export interface HexStake {
  id: string;
  stakeId: number;
  stakedHearts: bigint;
  stakeShares: bigint;
  lockedDay: number;
  stakedDays: number;
  unlockedDay: number;
  isAutoStake: boolean;
  progress: number; // 0 to 100
  estimatedValueUsd: number;
  interestHearts?: bigint;
  totalValueUsd?: number;
  chain: 'pulsechain' | 'ethereum';
  walletLabel?: string;
  walletAddress?: string;
  daysRemaining?: number;
  tShares?: number;
  stakedHex?: number;
  stakeHexYield?: number;
}

export interface LpPosition {
  pairAddress: string;
  pairName: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Amount: number;
  token1Amount: number;
  token0Usd: number;
  token1Usd: number;
  totalUsd: number;
  lpBalance: number;
}

export interface FarmPosition {
  poolId: number;
  lpAddress: string;
  pairName: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  stakedLp: number;
  token0Amount: number;
  token1Amount: number;
  token0Usd: number;
  token1Usd: number;
  totalUsd: number;
  pendingInc: number;
  pendingIncUsd: number;
}

export interface LpPositionEnriched extends LpPosition {
  totalSupply: number;
  ownershipPct: number;
  reserve0: number;
  reserve1: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  ilEstimate: number | null;      // result of IL formula x 100 for %, null if no entry
  fees24hUsd: number | null;
  volume24hUsd: number | null;
  isStaked: boolean;
  poolId?: number;
  pendingIncUsd?: number;
  walletLpBalance: number;   // LP tokens held in wallet (normalised to 1e18)
  stakedLpBalance: number;   // LP tokens staked in MasterChef (normalised to 1e18)
  sparkline: { t: number; v: number }[];  // 7 points, approximate - totalUsd � small variance
}

export interface PortfolioSummary {
  totalValue: number;
  pnl24h: number;
  pnl24hPercent: number;
  chainDistribution: Record<Chain, number>;
  nativeValue: number;
  netInvestment: number;
  unifiedPnl: number;
  realizedPnl: number;
  chainPnlUsd: Record<Chain, number>;
  chainPnlPercent: Record<Chain, number>;
}

export interface HistoryPoint {
  timestamp: number;
  value: number;
  nativeValue: number; // Value in PLS
  pnl: number;
  chainPnl?: Record<Chain, number>;
}

/** Normalized financial transaction types.
 *  - deposit   : tokens/native arriving in a wallet (transfer-in)
 *  - withdraw  : tokens/native leaving a wallet (transfer-out)
 *  - swap      : atomic exchange of one asset for another
 */
export type TransactionType = 'deposit' | 'withdraw' | 'swap';

export interface Transaction {
  /** Unique identifier (hash-based). */
  id: string;
  /** On-chain transaction hash. */
  hash: string;
  /** Unix epoch milliseconds. */
  timestamp: number;
  type: TransactionType;
  /** Sender address (lowercase). */
  from: string;
  /** Receiver address (lowercase). */
  to: string;
  /** Symbol of the primary asset (received for deposit/swap, sent for withdraw). */
  asset: string;
  /** Amount of the primary asset. */
  amount: number;
  /** USD value at time of transaction (optional - may be 0 for older txs). */
  valueUsd?: number;
  /** Gas fee paid in native token (PLS or ETH). */
  fee?: number;
  chain: Chain;
  // -- Swap-only fields ------------------------------------------------------
  /** Asset that was spent in the swap (the "sell" side). */
  counterAsset?: string;
  /** Amount of counterAsset spent. */
  counterAmount?: number;
  /** Estimated USD price per received asset at swap time or last sync. */
  assetPriceUsdAtTx?: number;
  /** Estimated USD price per spent asset at swap time or last sync. */
  counterPriceUsdAtTx?: number;
  /** True when only the spent side of an on-chain swap was available from the explorer. */
  swapLegOnly?: boolean;
  bridged?: boolean;
  status?: string;
  /** Present when this transaction was routed via Liberty Swap cross-chain bridge. */
  libertySwap?: {
    dstChainId: number;
    orderId: string;
  };
}
