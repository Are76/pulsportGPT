import type { Chain, InvestmentHoldingRow } from '../../types';
import type { HistoryDrilldownIntent } from '../history/historyDrilldown';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';

export interface WalletAnalyzerHoldingDrilldown {
  chain: Chain;
  symbol: string;
}

export interface WalletAnalyzerPageProps {
  model: WalletAnalyzerModel;
  investmentRows: InvestmentHoldingRow[];
  plsUsdPrice: number;
  onOpenTransactions: (intent: HistoryDrilldownIntent) => void;
  onOpenTransactionsForHolding: (holding: WalletAnalyzerHoldingDrilldown) => void;
  onOpenTransactionsForChain: (chain: Chain) => void;
}

export interface BuildWalletAnalyzerPagePropsArgs {
  model: WalletAnalyzerModel;
  investmentRows: InvestmentHoldingRow[];
  plsUsdPrice: number;
  onOpenTransactions: (intent: HistoryDrilldownIntent) => void;
}
