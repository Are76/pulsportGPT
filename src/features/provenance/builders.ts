import { fmtUsd } from '../../lib/utils';
import type { Asset, Chain, InvestmentHoldingRow, Transaction } from '../../types';
import {
  buildAnalyticsSource,
  buildPriceSource,
  buildTransactionHistorySource,
  buildTransactionSource,
} from './registry';
import type { DataSourceRef, ProvenanceAction, ProvenanceDescriptor, ProvenanceInput } from './types';

function signedPercent(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
}

function signedUsd(value: number): string {
  return `${value >= 0 ? '+' : '-'}${fmtUsd(Math.abs(value))}`;
}

function formatChain(chain: Chain): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

export function buildRawMetricProvenance({
  label,
  value,
  primarySource,
  explanation,
  actions,
}: {
  label: string;
  value: string;
  primarySource: DataSourceRef;
  explanation?: string;
  actions?: ProvenanceAction[];
}): ProvenanceDescriptor {
  return {
    label,
    value,
    primarySource,
    explanation,
    actions,
  };
}

export function buildDerivedMetricProvenance({
  label,
  value,
  formula,
  inputs,
  explanation,
  actions,
}: {
  label: string;
  value: string;
  formula: string;
  inputs: ProvenanceInput[];
  explanation?: string;
  actions?: ProvenanceAction[];
}): ProvenanceDescriptor {
  return {
    label,
    value,
    primarySource: buildAnalyticsSource('Derived from current portfolio history and snapshot data.'),
    formula,
    inputs,
    explanation,
    actions,
  };
}

export function buildAssetValueProvenance(asset: Pick<Asset, 'symbol' | 'chain' | 'balance' | 'price' | 'value'>): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label: `${asset.symbol} current value`,
    value: fmtUsd(asset.value),
    formula: 'Current value = token balance × current USD price.',
    inputs: [
      { label: 'Balance', value: asset.balance.toLocaleString('en-US', { maximumFractionDigits: 4 }) },
      {
        label: 'Current USD price',
        value: fmtUsd(asset.price, 6),
        source: buildPriceSource(asset.chain === 'pulsechain' ? 'pulsex' : asset.chain === 'ethereum' ? 'coingecko' : 'defillama', `${asset.symbol} spot price on ${formatChain(asset.chain)}`),
      },
    ],
    explanation: `${asset.symbol} is priced on ${formatChain(asset.chain)} and then multiplied by the tracked wallet balance.`,
  });
}

export function buildHoldingPnLProvenance(row: InvestmentHoldingRow): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label: `${row.symbol} profit and loss`,
    value: signedUsd(row.pnlUsd),
    formula: 'P&L = current value − cost basis.',
    inputs: [
      { label: 'Current value', value: fmtUsd(row.currentValue), source: buildTransactionHistorySource(`Current position snapshot for ${row.symbol}`) },
      { label: 'Cost basis', value: fmtUsd(row.costBasis), source: buildTransactionHistorySource(`Normalized transaction history for ${row.symbol}`) },
      { label: 'Route summary', value: row.routeSummary || 'No route summary', source: buildTransactionHistorySource('Inferred acquisition path') },
    ],
  });
}

export function buildHoldingWeightProvenance(row: InvestmentHoldingRow, portfolioValue: number): ProvenanceDescriptor {
  const weight = portfolioValue > 0 ? row.currentValue / portfolioValue : 0;
  return buildDerivedMetricProvenance({
    label: `${row.symbol} portfolio share`,
    value: `${(weight * 100).toFixed(2)}%`,
    formula: 'Portfolio share = position current value ÷ total NAV.',
    inputs: [
      { label: 'Position value', value: fmtUsd(row.currentValue), source: buildTransactionHistorySource(`${row.symbol} position value`) },
      { label: 'Portfolio NAV', value: fmtUsd(portfolioValue), source: buildAnalyticsSource('Current total tracked portfolio value') },
    ],
  });
}

export function buildNavProvenance(totalValue: number): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label: 'Net asset value',
    value: fmtUsd(totalValue),
    formula: 'NAV = sum of all tracked token, stake, LP, and farm values.',
    inputs: [
      { label: 'Tracked asset values', value: fmtUsd(totalValue), source: buildTransactionHistorySource('Aggregated cross-chain portfolio snapshot') },
    ],
  });
}

export function buildPercentMetricProvenance(label: string, value: number, inputs: ProvenanceInput[], formula: string): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label,
    value: signedPercent(value),
    formula,
    inputs,
  });
}

export function buildNumberMetricProvenance(label: string, value: string, inputs: ProvenanceInput[], formula: string): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label,
    value,
    formula,
    inputs,
  });
}

export function buildHoldingValueDescriptor(
  holding: { symbol: string; chain: Chain; valueUsd: number; weight: number; name?: string },
  options?: { drilldown?: () => void },
): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label: `${holding.symbol} allocation`,
    value: fmtUsd(holding.valueUsd),
    formula: 'Allocation value is the current marked-to-market value of the holding.',
    inputs: [
      { label: 'Current value', value: fmtUsd(holding.valueUsd), source: buildTransactionHistorySource(`${holding.symbol} holding valuation`) },
      { label: 'Portfolio weight', value: `${(holding.weight * 100).toFixed(1)}%`, source: buildAnalyticsSource('Share of current NAV') },
    ],
    explanation: `${holding.name ?? holding.symbol} on ${formatChain(holding.chain)} is ranked among the top holdings by current value.`,
    actions: options?.drilldown ? [{ label: `Open ${holding.symbol} transactions`, kind: 'drilldown', onSelect: options.drilldown }] : undefined,
  });
}

export function buildHoldingMoveDescriptor(
  holding: { symbol: string; chain: Chain; currentValue: number; moveUsd: number; pnlUsd: number; shareOfNav: number },
  options?: { drilldown?: () => void },
): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label: `${holding.symbol} position move`,
    value: signedUsd(holding.moveUsd),
    formula: 'Position move = stored current position snapshot − stored entry snapshot.',
    inputs: [
      { label: 'Current value', value: fmtUsd(holding.currentValue), source: buildTransactionHistorySource(`${holding.symbol} current snapshot`) },
      { label: 'Stored move', value: signedUsd(holding.moveUsd), source: buildTransactionHistorySource(`${holding.symbol} then-versus-now snapshot`) },
      { label: 'P&L', value: signedUsd(holding.pnlUsd), source: buildTransactionHistorySource(`${holding.symbol} normalized P&L`) },
      { label: 'Share of NAV', value: `${(holding.shareOfNav * 100).toFixed(1)}%`, source: buildAnalyticsSource('Current share of NAV') },
    ],
    actions: options?.drilldown ? [{ label: `Open ${holding.symbol} flow`, kind: 'drilldown', onSelect: options.drilldown }] : undefined,
  });
}

export function buildChainMixDescriptor(
  row: { chain: Chain; valueUsd: number; weight: number },
  moveUsd?: number,
  rangeLabel?: string,
  onDrilldown?: () => void,
): ProvenanceDescriptor {
  const inputs: ProvenanceInput[] = [
    { label: 'Current chain value', value: fmtUsd(row.valueUsd), source: buildTransactionHistorySource(`${formatChain(row.chain)} asset snapshot`) },
    { label: 'Current chain weight', value: `${(row.weight * 100).toFixed(1)}%`, source: buildAnalyticsSource('Share of current NAV') },
  ];
  if (moveUsd != null) {
    inputs.push({
      label: `${rangeLabel ?? 'Selected range'} move`,
      value: signedUsd(moveUsd),
      source: buildAnalyticsSource('Historical chain attribution over the selected time window'),
    });
  }
  return buildDerivedMetricProvenance({
    label: `${formatChain(row.chain)} chain mix`,
    value: `${(row.weight * 100).toFixed(1)}%`,
    formula: 'Chain mix = chain value ÷ total NAV, with range move from historical chain attribution.',
    inputs,
    actions: onDrilldown ? [{ label: `Open ${formatChain(row.chain)} history`, kind: 'drilldown', onSelect: onDrilldown }] : undefined,
  });
}

export function buildBehaviorMetricDescriptor(
  label: string,
  value: string,
  formula: string,
  inputs: ProvenanceInput[],
): ProvenanceDescriptor {
  return buildDerivedMetricProvenance({
    label,
    value,
    formula,
    inputs,
    explanation: 'These behavior metrics are derived from normalized transaction history, not direct explorer labels.',
  });
}

export function buildPerformancePointDescriptor(point: { label: string; value: number; pnl: number }, benchmarkValue?: number): ProvenanceDescriptor {
  const inputs: ProvenanceInput[] = [
    { label: 'Portfolio NAV', value: fmtUsd(point.value), source: buildTransactionHistorySource(`Portfolio snapshot at ${point.label}`) },
    { label: 'Daily P&L', value: signedUsd(point.pnl), source: buildAnalyticsSource(`Derived P&L at ${point.label}`) },
  ];
  if (benchmarkValue != null) {
    inputs.push({ label: 'Benchmark value', value: fmtUsd(benchmarkValue), source: buildAnalyticsSource(`Synthetic benchmark comparison at ${point.label}`) });
  }
  return buildDerivedMetricProvenance({
    label: `Performance point ${point.label}`,
    value: fmtUsd(point.value),
    formula: 'Point value is the tracked portfolio NAV at the selected timestamp.',
    inputs,
  });
}

export function buildTransactionAmountDescriptor(tx: Transaction, options?: { onDrilldown?: () => void }): ProvenanceDescriptor {
  const swapDescription = tx.type === 'swap' && tx.counterAsset
    ? `Paid ${(tx.counterAmount ?? 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.counterAsset} and received ${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}.`
    : `${tx.type} ${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}.`;
  return buildRawMetricProvenance({
    label: `${tx.asset} amount`,
    value: `${tx.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${tx.asset}`,
    primarySource: buildTransactionSource(tx, swapDescription),
    explanation: 'This value comes from the normalized on-chain transaction record for the selected hash.',
    actions: [
      { label: 'Open explorer', kind: 'external', href: buildTransactionSource(tx).href },
      ...(options?.onDrilldown ? [{ label: `Filter ${tx.asset} history`, kind: 'drilldown' as const, onSelect: options.onDrilldown }] : []),
    ],
  });
}

export function buildTransactionUsdDescriptor(
  tx: Transaction,
  resolvedUsdValue: number,
  currentPrice?: number,
): ProvenanceDescriptor {
  const inputs: ProvenanceInput[] = [
    { label: 'Resolved USD value', value: fmtUsd(resolvedUsdValue), source: buildTransactionSource(tx, 'Normalized transaction USD value') },
  ];
  if (currentPrice != null && currentPrice > 0) {
    inputs.push({
      label: 'Current tracked price',
      value: fmtUsd(currentPrice, 6),
      source: buildPriceSource(tx.chain === 'pulsechain' ? 'pulsex' : tx.chain === 'ethereum' ? 'coingecko' : 'defillama', `${tx.asset} current quote`),
    });
  }
  return buildDerivedMetricProvenance({
    label: `${tx.asset} USD value`,
    value: fmtUsd(resolvedUsdValue),
    formula: 'USD value is taken from the transaction record when present, then falls back to transaction-time or current price resolution.',
    inputs,
  });
}

export function buildTransactionMetadataDescriptor(
  label: string,
  value: string,
  tx: Transaction,
  detail: string,
): ProvenanceDescriptor {
  return buildRawMetricProvenance({
    label,
    value,
    primarySource: buildTransactionSource(tx, detail),
    explanation: 'This label is sourced from normalized bridge or staking metadata attached to the transaction.',
    actions: [{ label: 'Open explorer', kind: 'external', href: buildTransactionSource(tx).href }],
  });
}
