/**
 * normalizeTransactions
 * ---------------------
 * Pure function that converts a flat list of raw deposit/withdraw transactions
 * into a normalized list where same-hash in+out pairs are collapsed into a
 * single `swap` record.
 *
 * This is the ONLY place swap-detection logic should live.
 * All UI code must consume the output of this function - never raw blockchain
 * structures directly.
 */

import type { Transaction } from '../types';

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

  return result.sort((a, b) => b.timestamp - a.timestamp);
}
