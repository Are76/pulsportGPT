import type { Chain, Transaction } from '../../types';
import type { DataSourceKind, DataSourceRef } from './types';

const SOURCE_KIND_LABEL: Record<DataSourceKind, string> = {
  explorer: 'Explorer',
  dexscreener: 'DexScreener',
  coingecko: 'CoinGecko',
  defillama: 'DeFi Llama',
  pulsex: 'PulseX reserve quote',
  'portfolio-history': 'Portfolio transaction history',
  analytics: 'Analytics model output',
};

const EXPLORER_BASE: Record<Chain, string> = {
  pulsechain: 'https://scan.pulsechain.com',
  ethereum: 'https://etherscan.io',
  base: 'https://basescan.org',
};

export function buildSourceRef(
  kind: DataSourceKind,
  detail?: string,
  overrides?: Partial<Omit<DataSourceRef, 'kind'>>,
): DataSourceRef {
  return {
    kind,
    label: overrides?.label ?? SOURCE_KIND_LABEL[kind],
    detail: overrides?.detail ?? detail,
    href: overrides?.href,
  };
}

export function buildExplorerSource(
  chain: Chain,
  hash: string,
  detail?: string,
): DataSourceRef {
  return buildSourceRef('explorer', detail ?? `${chain} transaction ${hash.slice(0, 10)}…`, {
    href: `${EXPLORER_BASE[chain]}/tx/${hash}`,
  });
}

export function buildTransactionHistorySource(detail?: string): DataSourceRef {
  return buildSourceRef('portfolio-history', detail);
}

export function buildAnalyticsSource(detail?: string): DataSourceRef {
  return buildSourceRef('analytics', detail);
}

export function buildPriceSource(
  provider: 'pulsex' | 'coingecko' | 'defillama',
  detail?: string,
  href?: string,
): DataSourceRef {
  return buildSourceRef(provider, detail, { href });
}

export function buildTransactionSource(tx: Transaction, detail?: string): DataSourceRef {
  return buildExplorerSource(tx.chain, tx.hash, detail ?? `${tx.type} on ${tx.chain}`);
}
