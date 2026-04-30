import type { InvestmentHoldingRow } from '../../types';
import { buildAssetHistoryIntent, type HistoryDrilldownIntent } from '../history/historyDrilldown';
import type {
  BuildWalletAnalyzerPagePropsArgs,
  WalletAnalyzerHoldingDrilldown,
  WalletAnalyzerPageProps,
} from './walletAnalyzerTypes';

const toHoldingKey = (chain: string, symbol: string) => `${chain}:${symbol}`.toUpperCase();

export function buildWalletAnalyzerPageProps({
  model,
  investmentRows,
  plsUsdPrice,
  onOpenTransactions,
  onOpenPlanner,
}: BuildWalletAnalyzerPagePropsArgs): { pageProps: WalletAnalyzerPageProps } {
  const investmentRowByHolding = new Map<string, InvestmentHoldingRow>(
    investmentRows.map((row) => [toHoldingKey(row.chain, row.symbol), row]),
  );
  const firstInvestmentRowByChain = new Map<InvestmentHoldingRow['chain'], InvestmentHoldingRow>();

  for (const row of investmentRows) {
    if (!firstInvestmentRowByChain.has(row.chain)) {
      firstInvestmentRowByChain.set(row.chain, row);
    }
  }

  const onOpenTransactionsForHolding = (holding: WalletAnalyzerHoldingDrilldown) => {
    const row = investmentRowByHolding.get(toHoldingKey(holding.chain, holding.symbol));
    const intent: HistoryDrilldownIntent = row
      ? buildAssetHistoryIntent(row)
      : { kind: 'asset', symbol: holding.symbol, chain: holding.chain, txType: 'all' };
    onOpenTransactions(intent);
  };

  const onOpenTransactionsForChain: WalletAnalyzerPageProps['onOpenTransactionsForChain'] = (chain) => {
    onOpenTransactions({ kind: 'chain', chain, txType: 'all' });
  };

  return {
    pageProps: {
      model,
      investmentRows,
      plsUsdPrice,
      onOpenTransactions,
      onOpenTransactionsForHolding,
      onOpenTransactionsForChain,
      onOpenPlanner,
    },
  };
}
