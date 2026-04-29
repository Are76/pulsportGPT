/**
 * normalizeTransactions
 * ---------------------
 * Pure function that converts a flat list of raw deposit/withdraw transactions
 * into a normalized list where same-hash in+out pairs are collapsed into a
 * single `swap` record.
 *
 * Second-pass enrichments (applied after swap collapse):
 *   - Bridge correlation: matches a withdraw on chain A with a deposit on chain B
 *     within ±2 hours and the same USD value (±5%) and tags both as `bridged`.
 *   - Cross-wallet transfer tagging: when both `from` and `to` are known wallet
 *     addresses the transaction is re-typed as `internal-transfer` so P&L
 *     calculations can exclude it.
 *   - walletAddress stamping: each output transaction receives the `walletAddress`
 *     field derived from whichever wallet side was matched.
 *
 * This is the ONLY place swap-detection and cross-chain correlation logic should
 * live.  All UI code must consume the output of this function – never raw
 * blockchain structures directly.
 */

import type { Chain, Transaction } from '../types';

/** Native gas token symbol per chain. Used to filter out zero-value router invocations. */
const NATIVE_TOKEN: Record<string, string> = {
  pulsechain: 'PLS',
  ethereum:   'ETH',
  base:       'ETH',
};

const isZeroValueNativeCall = (t: Transaction): boolean =>
  t.amount <= 0 && t.asset === NATIVE_TOKEN[t.chain];

const isOwnAddress = (addr: string | undefined, walletAddrs: Set<string>): boolean =>
  !!addr && walletAddrs.has(addr.toLowerCase());

const normalizeSymbol = (symbol: string | undefined): string =>
  (symbol ?? '').trim().toUpperCase();

export function normalizeTransactions(
  rawTxs: Transaction[],
  walletAddrs: Set<string>,
): Transaction[] {
  // Group all raw transactions by their on-chain hash
  const byHash: Record<string, Transaction[]> = {};
  rawTxs.forEach(tx => {
    if (!byHash[tx.hash]) byHash[tx.hash] = [];
    byHash[tx.hash].push(tx);
  });

  const result: Transaction[] = [];
  const seen = new Set<string>();

  Object.entries(byHash).forEach(([hash, txs]) => {
    const hasOutboundZeroValueCall = txs.some(t =>
      isZeroValueNativeCall(t) &&
      isOwnAddress(t.from, walletAddrs) &&
      !isOwnAddress(t.to, walletAddrs),
    );

    // Only include transactions that involve at least one of the user's wallets
    const relevant = txs.filter(t =>
      !isZeroValueNativeCall(t) &&
      (isOwnAddress(t.from, walletAddrs) || isOwnAddress(t.to, walletAddrs)),
    );
    if (relevant.length === 0) return;

    if (relevant.length === 1 && relevant[0].type === 'withdraw' && hasOutboundZeroValueCall) {
      const tx = relevant[0];
      if (!seen.has(tx.id)) {
        seen.add(tx.id);
        result.push({ ...tx, swapLegOnly: true });
      }
      return;
    }

    if (relevant.length > 1) {
      const outs = relevant.filter(t => t.type === 'withdraw');
      const ins  = relevant.filter(t => t.type === 'deposit');

      // Helper: identify zero-value native-token calls (router invocations with no value)
      const isNativeTx = (t: Transaction) => t.asset === NATIVE_TOKEN[t.chain];

      // In + Out on the same hash -> this is a swap
      if (outs.length > 0 && ins.length > 0) {
        const txUsd = (t: Transaction) => t.valueUsd ?? 0;

        // Prefer the leg with real economic value. Amount alone is misleading
        // when routers hop through tokens with very different decimal scales.
        const pickBest = (arr: Transaction[]): Transaction => {
          const tokens = arr.filter(t => !isNativeTx(t) && t.amount > 0);
          if (tokens.length) return tokens.reduce((b, t) => {
            const tScore = txUsd(t) > 0 ? txUsd(t) : t.amount;
            const bScore = txUsd(b) > 0 ? txUsd(b) : b.amount;
            return tScore > bScore ? t : b;
          });
          const nonZero = arr.filter(t => t.amount > 0);
          if (nonZero.length) return nonZero.reduce((b, t) => {
            const tScore = txUsd(t) > 0 ? txUsd(t) : t.amount;
            const bScore = txUsd(b) > 0 ? txUsd(b) : b.amount;
            return tScore > bScore ? t : b;
          });
          return arr[0];
        };

        const outTx = pickBest(outs);
        const inTx  = pickBest(ins);

        // Same-asset in/out on one hash is usually a transfer pattern or explorer artifact,
        // not an economic swap. Keep both legs so history stays truthful.
        if (normalizeSymbol(outTx.asset) === normalizeSymbol(inTx.asset)) {
          relevant.forEach(tx => {
            if (!seen.has(tx.id)) {
              seen.add(tx.id);
              result.push(tx);
            }
          });
          return;
        }

        const id = `${hash}-swap`;

        if (!seen.has(id)) {
          seen.add(id);
          result.push({
            ...inTx,
            id,
            type: 'swap',
            from: outTx.from,
            to: outTx.to || inTx.from,
            valueUsd: inTx.valueUsd || outTx.valueUsd,
            counterAsset: outTx.asset,
            counterAmount: outTx.amount,
            assetPriceUsdAtTx: inTx.amount > 0 && inTx.valueUsd != null ? inTx.valueUsd / inTx.amount : undefined,
            counterPriceUsdAtTx: outTx.amount > 0 && outTx.valueUsd != null ? outTx.valueUsd / outTx.amount : undefined,
            bridged: inTx.bridged || outTx.bridged,
            bridge: inTx.bridge ?? outTx.bridge,
            staking: inTx.staking ?? outTx.staking,
            libertySwap: inTx.libertySwap ?? outTx.libertySwap,
          });
        }
        return;
      }

      // Multiple outs, no ins -> e.g. token sold for native PLS via internal transfer
      // Drop the zero-amount native-call entry; keep only the actual token-out
      if (outs.length >= 2 && ins.length === 0) {
        const tokenOuts = outs.filter(t => !isNativeTx(t) && t.amount > 0);
        const toKeep = tokenOuts.length > 0 ? tokenOuts : outs.filter(t => t.amount > 0);
        toKeep.forEach(tx => {
          if (!seen.has(tx.id)) {
            seen.add(tx.id);
            result.push(tx);
          }
        });
        return;
      }
    }

    // Single transaction (or no swap pattern detected) - include as-is
    relevant.forEach(tx => {
      if (!seen.has(tx.id)) {
        seen.add(tx.id);
        result.push(tx);
      }
    });
  });

  const collapsed = result.sort((a, b) => b.timestamp - a.timestamp);
  return applySecondPassEnrichments(collapsed, walletAddrs);
}

// ---------------------------------------------------------------------------
// Second-pass enrichments
// ---------------------------------------------------------------------------

/** Maximum time window in ms between a withdraw on chain A and a deposit on
 *  chain B for them to be considered correlated bridge legs. */
const BRIDGE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Maximum relative USD value difference between the two bridge legs. */
const BRIDGE_VALUE_TOLERANCE = 0.05; // 5 %

function applySecondPassEnrichments(
  txs: Transaction[],
  walletAddrs: Set<string>,
): Transaction[] {
  const output = txs.map(tx => {
    // Stamp walletAddress from the side that belongs to the user
    if (!tx.walletAddress) {
      const matchedAddr =
        isOwnAddress(tx.to, walletAddrs) ? tx.to :
        isOwnAddress(tx.from, walletAddrs) ? tx.from :
        undefined;
      if (matchedAddr) {
        return { ...tx, walletAddress: matchedAddr.toLowerCase() };
      }
    }
    return tx;
  });

  // Tag cross-wallet transfers (internal-transfer)
  const tagged = output.map(tx => {
    if (tx.type !== 'deposit' && tx.type !== 'withdraw') return tx;
    if (isOwnAddress(tx.from, walletAddrs) && isOwnAddress(tx.to, walletAddrs)) {
      return { ...tx, type: 'internal-transfer' as const };
    }
    return tx;
  });

  // Bridge correlation pass
  return correlateBridgeLegs(tagged);
}

/**
 * Match withdraw legs on one chain with deposit legs on a different chain that
 * occurred within BRIDGE_WINDOW_MS and have a USD value within
 * BRIDGE_VALUE_TOLERANCE of each other.  Both legs are annotated with
 * `bridged: true` and `bridge.originChain`.
 */
function correlateBridgeLegs(txs: Transaction[]): Transaction[] {
  // Only consider transactions that are not already tagged as bridged
  const withdraws = txs.filter(
    tx => (tx.type === 'withdraw' || tx.type === 'internal-transfer') && !tx.bridged && (tx.valueUsd ?? 0) > 0,
  );
  const deposits = txs.filter(
    tx => (tx.type === 'deposit' || tx.type === 'internal-transfer') && !tx.bridged && (tx.valueUsd ?? 0) > 0,
  );

  // Map id → mutable copy for annotation
  const byId = new Map<string, Transaction>(txs.map(tx => [tx.id, { ...tx }]));

  const usedWithdraws = new Set<string>();
  const usedDeposits = new Set<string>();

  for (const withdraw of withdraws) {
    if (usedWithdraws.has(withdraw.id)) continue;

    const wUsd = withdraw.valueUsd!;

    for (const deposit of deposits) {
      if (usedDeposits.has(deposit.id)) continue;
      if (deposit.chain === withdraw.chain) continue;

      const dUsd = deposit.valueUsd!;
      const timeDiff = Math.abs(deposit.timestamp - withdraw.timestamp);
      if (timeDiff > BRIDGE_WINDOW_MS) continue;

      const maxVal = Math.max(wUsd, dUsd, 1);
      if (Math.abs(wUsd - dUsd) / maxVal > BRIDGE_VALUE_TOLERANCE) continue;

      // Match found — annotate both legs
      const originChain = withdraw.chain as Chain;

      const wAnnotated = byId.get(withdraw.id);
      if (wAnnotated) {
        wAnnotated.bridged = true;
        wAnnotated.bridge = wAnnotated.bridge ?? { originChain, protocol: 'official' };
      }

      const dAnnotated = byId.get(deposit.id);
      if (dAnnotated) {
        dAnnotated.bridged = true;
        dAnnotated.bridge = dAnnotated.bridge ?? { originChain, protocol: 'official' };
      }

      usedWithdraws.add(withdraw.id);
      usedDeposits.add(deposit.id);
      break;
    }
  }

  // Rebuild in original order
  return txs.map(tx => byId.get(tx.id) ?? tx);
}
