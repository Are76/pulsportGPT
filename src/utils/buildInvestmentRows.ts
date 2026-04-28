import type { Asset, Chain, InvestmentHoldingRow, InvestmentSourceAttribution, Transaction } from '../types';

interface PositionState {
  amount: number;
  totalCost: number;
  sourceMix: Map<string, InvestmentSourceAttribution>;
  routes: string[];
}

const BRIDGE_LABEL_RE = /\((?:from\s+(Ethereum|ETH|Base)|Liberty Bridge)\)/i;
const STABLE_FAMILIES = new Set(['USDC', 'USDT', 'DAI']);

const chainLabel = (chain: Chain) => chain.charAt(0).toUpperCase() + chain.slice(1);

function sanitizeSymbol(asset: string): string {
  return asset
    .replace(BRIDGE_LABEL_RE, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9]/g, '');
}

function sourceFamily(asset: string): string {
  const upper = asset.toUpperCase();
  if (upper.includes('USDC')) return 'USDC';
  if (upper.includes('USDT')) return 'USDT';
  if (upper.includes('DAI')) return 'DAI';
  if (upper.includes('WETH') || upper === 'ETH') return 'ETH';
  if (upper === 'EHEX' || upper.includes('EHEX')) return 'eHEX';
  return sanitizeSymbol(asset).toUpperCase() || asset.toUpperCase();
}

function parseOriginChain(asset: string): Chain | null {
  const upper = asset.toUpperCase();
  if (upper.includes('(FROM BASE)')) return 'base';
  if (upper.includes('(FROM ETHEREUM)') || upper.includes('(FROM ETH)') || upper.includes('(LIBERTY BRIDGE)')) {
    return 'ethereum';
  }
  return null;
}

function resolveOriginChain(tx: Pick<Transaction, 'asset' | 'bridge'>): Chain | null {
  return tx.bridge?.originChain ?? parseOriginChain(tx.asset);
}

function bridgeAdjustedSymbol(family: string): string {
  if (family === 'ETH') return 'WETH';
  if (family === 'eHEX' || family === 'HEX') return 'eHEX';
  if (STABLE_FAMILIES.has(family)) return `p${family}`;
  return family;
}

function normalizeTxSymbol(asset: string, chain: Chain, originChain?: Chain | null): string {
  const upper = asset.toUpperCase();
  if (upper === 'EHEX' || upper.includes('EHEX')) return 'eHEX';
  if (upper.startsWith('PDAI')) return 'pDAI';
  if (upper.startsWith('PUSDC')) return 'pUSDC';
  if (upper.startsWith('PUSDT')) return 'pUSDT';

  const family = sourceFamily(asset);
  const resolvedOriginChain = originChain ?? parseOriginChain(asset);

  if (chain === 'pulsechain' && resolvedOriginChain) {
    return bridgeAdjustedSymbol(family);
  }

  if (
    chain === 'pulsechain'
    && STABLE_FAMILIES.has(family)
    && (upper.includes('FORK COPY') || upper.includes('SYSTEM COPY'))
  ) {
    return `p${family}`;
  }

  if (family === 'ETH' && upper.includes('WETH')) return 'WETH';
  return family === 'eHEX' ? 'eHEX' : sanitizeSymbol(asset) || family;
}

function normalizeHoldingSymbol(asset: Pick<Asset, 'symbol' | 'name' | 'chain'>): string {
  const symbol = (asset.symbol || '').toUpperCase();
  const name = (asset.name || '').toUpperCase();

  if (asset.chain === 'pulsechain' && symbol === 'WPLS') return 'PLS';
  if (symbol === 'EHEX' || ((symbol === 'HEX' || symbol === 'EHEX') && name.includes('FROM ETHEREUM'))) return 'eHEX';
  if (symbol === 'PDAI') return 'pDAI';
  if (symbol === 'PUSDC') return 'pUSDC';
  if (symbol === 'PUSDT') return 'pUSDT';

  if (asset.chain === 'pulsechain' && (name.includes('FROM ETHEREUM') || name.includes('FROM ETH') || name.includes('FROM BASE') || name.includes('LIBERTY BRIDGE'))) {
    if (symbol === 'USDC') return 'pUSDC';
    if (symbol === 'USDT') return 'pUSDT';
    if (symbol === 'DAI') return 'pDAI';
    if (symbol === 'WETH') return 'WETH';
    if (symbol === 'WBTC') return 'WBTC';
    if (symbol === 'HEX' || symbol === 'EHEX') return 'eHEX';
  }

  if (
    asset.chain === 'pulsechain'
    && ['DAI', 'USDC', 'USDT'].includes(symbol)
    && (name.includes('FORK COPY') || name.includes('SYSTEM COPY'))
  ) {
    return `p${symbol}`;
  }

  return asset.symbol;
}

function holdingKeys(asset: Pick<Asset, 'symbol' | 'name' | 'chain'>): string[] {
  const primary = assetKey(asset.chain, normalizeHoldingSymbol(asset));
  const keys = new Set<string>([primary]);
  const symbol = (asset.symbol || '').toUpperCase();
  const name = (asset.name || '').toUpperCase();

  if (asset.chain === 'pulsechain' && !name.includes('FROM') && !name.includes('LIBERTY') && !name.includes('FORK') && !name.includes('SYSTEM')) {
    if (STABLE_FAMILIES.has(symbol)) keys.add(assetKey(asset.chain, `p${symbol}`));
    if (symbol === 'WETH') keys.add(assetKey(asset.chain, 'WETH'));
    if (symbol === 'WBTC') keys.add(assetKey(asset.chain, 'WBTC'));
    if (symbol === 'HEX' || symbol === 'EHEX') keys.add(assetKey(asset.chain, 'eHEX'));
  }

  return [...keys];
}

function assetKey(chain: Chain, symbol: string): string {
  return `${chain}:${symbol}`;
}

function stakingPositionKey(chain: Chain, protocol: string, symbol: string): string {
  return `staking:${chain}:${protocol}:${symbol}`;
}

function ensurePosition(store: Map<string, PositionState>, key: string): PositionState {
  let position = store.get(key);
  if (!position) {
    position = { amount: 0, totalCost: 0, sourceMix: new Map(), routes: [] };
    store.set(key, position);
  }
  return position;
}

function cloneSources(sources: InvestmentSourceAttribution[]): Map<string, InvestmentSourceAttribution> {
  const map = new Map<string, InvestmentSourceAttribution>();
  sources.forEach((source) => {
    map.set(`${source.asset}:${source.chain}`, { ...source });
  });
  return map;
}

function addSourceMix(target: Map<string, InvestmentSourceAttribution>, sources: Map<string, InvestmentSourceAttribution>) {
  sources.forEach((source, key) => {
    const existing = target.get(key);
    if (existing) existing.amountUsd += source.amountUsd;
    else target.set(key, { ...source });
  });
}

function seedSources(asset: string, chain: Chain, usd: number): Map<string, InvestmentSourceAttribution> {
  const family = sourceFamily(asset);
  const sourceChain = parseOriginChain(asset) ?? chain;
  return cloneSources([{ asset: family, chain: sourceChain, amountUsd: usd }]);
}

function txUsdValue(tx: Transaction, ethUsdPrice: number): number {
  if ((tx.valueUsd ?? 0) > 0) return tx.valueUsd ?? 0;
  const family = sourceFamily(tx.asset);
  if (family === 'ETH') return tx.amount * ethUsdPrice;
  if (STABLE_FAMILIES.has(family)) return tx.amount;
  return 0;
}

function pushRoute(position: PositionState, route: string) {
  if (!route) return;
  if (position.routes[position.routes.length - 1] === route) return;
  position.routes.push(route);
  if (position.routes.length > 4) position.routes.shift();
}

function removeFromPosition(
  store: Map<string, PositionState>,
  key: string,
  amount: number,
  fallbackUsd = 0,
): { cost: number; sources: Map<string, InvestmentSourceAttribution> } {
  const position = store.get(key);
  if (!position || position.amount <= 0 || amount <= 0) {
    return { cost: fallbackUsd, sources: new Map() };
  }

  const ratio = Math.min(1, amount / position.amount);
  const removedCost = position.totalCost * ratio;
  const removedSources = new Map<string, InvestmentSourceAttribution>();

  position.sourceMix.forEach((source, sourceKey) => {
    const amountUsd = source.amountUsd * ratio;
    removedSources.set(sourceKey, { ...source, amountUsd });
    source.amountUsd -= amountUsd;
    if (source.amountUsd <= 0.0001) position.sourceMix.delete(sourceKey);
  });

  position.amount -= position.amount * ratio;
  position.totalCost -= removedCost;

  if (position.amount <= 0.0000001) {
    position.amount = 0;
    position.totalCost = 0;
    position.sourceMix.clear();
  }

  return { cost: removedCost || fallbackUsd, sources: removedSources };
}

function addToPosition(
  store: Map<string, PositionState>,
  key: string,
  amount: number,
  cost: number,
  sources: Map<string, InvestmentSourceAttribution>,
  route?: string,
) {
  if (amount <= 0) return;
  const position = ensurePosition(store, key);
  position.amount += amount;
  position.totalCost += cost;
  addSourceMix(position.sourceMix, sources);
  if (route) pushRoute(position, route);
}

function buildRouteSummary(position?: PositionState): string {
  if (!position || position.routes.length === 0) return 'Tracked from imported transaction history';
  return position.routes.slice(-2).join(' • ');
}

export function buildInvestmentRows(
  currentAssets: Asset[],
  currentTransactions: Transaction[],
  ethUsdPrice: number,
): InvestmentHoldingRow[] {
  const positions = new Map<string, PositionState>();
  const txs = [...currentTransactions].sort((a, b) => a.timestamp - b.timestamp);

  txs.forEach((tx) => {
    const originChain = resolveOriginChain(tx);
    const receiveSymbol = normalizeTxSymbol(tx.asset, tx.chain, originChain);
    const receiveKey = assetKey(tx.chain, receiveSymbol);
    const usdValue = txUsdValue(tx, ethUsdPrice);

    if (tx.type === 'deposit') {
      if (tx.staking?.protocol === 'hex' && tx.staking.action === 'stakeEnd') {
        const released = removeFromPosition(
          positions,
          stakingPositionKey(tx.chain, tx.staking.protocol, receiveSymbol),
          tx.amount,
          usdValue,
        );
        const sources = released.sources.size > 0 ? released.sources : seedSources(tx.asset, tx.chain, released.cost || usdValue);
        addToPosition(positions, receiveKey, tx.amount, released.cost || usdValue, sources, `${receiveSymbol} stakeEnd`);
        return;
      }

      const family = sourceFamily(tx.asset);
      const originSymbol = originChain ? normalizeTxSymbol(family, originChain) : receiveSymbol;
      const originKey = originChain ? assetKey(originChain, originSymbol) : null;

      if (originChain && originKey && (originChain === 'ethereum' || originChain === 'base')) {
        const transferred = removeFromPosition(positions, originKey, tx.amount, usdValue);
        const route = `${chainLabel(originChain)}${tx.bridge?.protocol ? ` ${tx.bridge.protocol}` : ''} bridge -> ${receiveSymbol}`;
        const sources = transferred.sources.size > 0 ? transferred.sources : seedSources(tx.asset, tx.chain, transferred.cost || usdValue);
        addToPosition(positions, receiveKey, tx.amount, transferred.cost || usdValue, sources, route);
        return;
      }

      if (tx.chain !== 'ethereum' && tx.chain !== 'base') {
        return;
      }

      addToPosition(positions, receiveKey, tx.amount, usdValue, seedSources(tx.asset, tx.chain, usdValue), `${sourceFamily(tx.asset)} deposit`);
      return;
    }

    if (tx.type === 'withdraw') {
      if (tx.staking?.protocol === 'hex' && tx.staking.action === 'stakeStart') {
        const staked = removeFromPosition(positions, receiveKey, tx.amount, usdValue);
        const sources = staked.sources.size > 0 ? staked.sources : seedSources(tx.asset, tx.chain, staked.cost || usdValue);
        addToPosition(
          positions,
          stakingPositionKey(tx.chain, tx.staking.protocol, receiveSymbol),
          tx.amount,
          staked.cost || usdValue,
          sources,
          `${receiveSymbol} stakeStart`,
        );
        return;
      }

      removeFromPosition(positions, receiveKey, tx.amount, usdValue);
      return;
    }

    if (tx.type === 'swap') {
      const soldSymbol = normalizeTxSymbol(tx.counterAsset || '', tx.chain);
      const soldKey = assetKey(tx.chain, soldSymbol);
      const removed = removeFromPosition(positions, soldKey, tx.counterAmount || 0, usdValue);
      const sources = removed.sources.size > 0 ? removed.sources : seedSources(tx.counterAsset || tx.asset, tx.chain, removed.cost || usdValue);
      addToPosition(positions, receiveKey, tx.amount, removed.cost || usdValue, sources, `${soldSymbol} -> ${receiveSymbol}`);
    }
  });

  return currentAssets
    .filter((asset) => asset.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((asset) => {
      const position = holdingKeys(asset)
        .map(key => positions.get(key))
        .find((candidate): candidate is PositionState => candidate !== undefined);
      const costBasis = position?.totalCost ?? 0;
      const pnlUsd = asset.value - costBasis;
      const pnlPercent = costBasis > 0 ? (pnlUsd / costBasis) * 100 : 0;
      const sourceMix = [...(position?.sourceMix.values() ?? [])]
        .sort((a, b) => b.amountUsd - a.amountUsd)
        .slice(0, 4)
        .map((source) => ({ ...source }));

      return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        chain: asset.chain,
        address: asset.address,
        logoUrl: asset.logoUrl,
        amount: asset.balance,
        currentPrice: asset.price,
        priceChange24h: asset.priceChange24h ?? asset.pnl24h ?? 0,
        currentValue: asset.value,
        costBasis,
        pnlUsd,
        pnlPercent,
        sourceMix,
        routeSummary: buildRouteSummary(position),
        thenValue: costBasis,
        nowValue: asset.value,
      };
    });
}
