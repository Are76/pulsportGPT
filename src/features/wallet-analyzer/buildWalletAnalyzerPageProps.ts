import type { InvestmentHoldingRow } from '../../types';
import { buildAssetHistoryIntent, type HistoryDrilldownIntent } from '../history/historyDrilldown';
import type {
  BuildWalletAnalyzerPagePropsArgs,
  WalletAnalyzerHoldingDrilldown,
  WalletAnalyzerPageProps,
} from './walletAnalyzerTypes';

const toHoldingKey = (chain: string, symbol: string) => `${chain}:${symbol}`.toUpperCase();

/**
 * Builds Wallet Analyzer page props including lookup maps and transaction drilldown handlers.
 *
 * @param args - Builder inputs
 * @param args.model - Page model passed through to the resulting props
 * @param args.investmentRows - Investment holding rows used to build lookup maps for holdings and chains
 * @param args.plsUsdPrice - Current PLS price in USD forwarded to the page props
 * @param args.onOpenTransactions - Callback invoked with a `HistoryDrilldownIntent` when transactions are requested
 * @param args.onOpenPlanner - Callback forwarded to the page props for opening the planner
 * @returns An object with a `pageProps` property containing the configured WalletAnalyzerPageProps
 */
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
