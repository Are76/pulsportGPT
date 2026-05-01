import { fmtTok } from '../../lib/utils';
import type { HistoryDrilldownIntent } from '../../features/history/historyDrilldown';
import type { WalletAnalyzerModel } from '../../utils/buildWalletAnalyzerModel';

/**
 * Formats a PLS amount with a leading `+` or `-` and the `PLS` unit.
 *
 * @param value - The PLS amount (positive, zero, or negative)
 * @returns A string starting with `+` if `value >= 0` or `-` otherwise, followed by the absolute formatted amount and the `PLS` suffix (e.g. `+123.45 PLS`)
 */
function formatSignedPls(value: number): string {
  return `${value >= 0 ? '+' : '-'}${fmtTok(Math.abs(value))} PLS`;
}

/**
 * Render the "Core Rotation vs PLS" panel that summarizes rotation performance and provides drilldowns.
 *
 * Displays total, realized, and unrealized PLS results for the core rotation basket, a table of up to six pair routes with per-route realized PnL and flow drilldowns, and notes for best/weakest realized routes when available.
 *
 * @param rotation - Wallet analyzer rotation data (totals, counts, and `pairStats` entries used to populate summary cards and the pair table)
 * @param onOpenTransactions - Callback invoked with a `HistoryDrilldownIntent` when the user requests transaction drilldowns (chain-level or asset-level swap flows)
 * @returns A React element containing the Core Rotation UI panel
 */
export function CoreRotationCard({
  rotation,
  onOpenTransactions,
}: {
  rotation: WalletAnalyzerModel['rotation'];
  onOpenTransactions: (intent: HistoryDrilldownIntent) => void;
}) {
  const bestPair = rotation.pairStats[0];
  const worstPair = [...rotation.pairStats].sort((a, b) => a.realizedPnlPls - b.realizedPnlPls)[0];

  return (
    <section className="wa-panel">
      <div className="wa-panel__head">
        <div>
          <p className="wa-kicker">Rotation</p>
          <h2 className="wa-title">Core Rotation vs PLS</h2>
          <p className="wa-panel__description">
            Measures whether rotating between PLS, PLSX, INC, PRVX, pHEX, and eHEX added or destroyed PLS.
          </p>
        </div>
        <button
          type="button"
          className="wa-inline-action"
          onClick={() => onOpenTransactions({ kind: 'chain', chain: 'pulsechain', txType: 'swap' })}
        >
          Open core swaps
        </button>
      </div>

      <div className="wa-rotation-summary">
        <article className="wa-rotation-card">
          <span>Total alpha</span>
          <strong className={rotation.totalPnlPls >= 0 ? 'wa-value-up' : 'wa-value-down'}>
            {formatSignedPls(rotation.totalPnlPls)}
          </strong>
          <p>Realized plus unrealized PLS result across the tracked core rotation basket.</p>
        </article>
        <article className="wa-rotation-card">
          <span>Realized</span>
          <strong className={rotation.realizedPnlPls >= 0 ? 'wa-value-up' : 'wa-value-down'}>
            {formatSignedPls(rotation.realizedPnlPls)}
          </strong>
          <p>{rotation.realizedRotationCount} closed rotation{rotation.realizedRotationCount === 1 ? '' : 's'} banked.</p>
        </article>
        <article className="wa-rotation-card">
          <span>Open edge</span>
          <strong className={rotation.unrealizedPnlPls >= 0 ? 'wa-value-up' : 'wa-value-down'}>
            {formatSignedPls(rotation.unrealizedPnlPls)}
          </strong>
          <p>Current mark-to-market edge left in open core positions.</p>
        </article>
      </div>

      <div className="wa-rotation-table">
        {rotation.pairStats.length === 0 ? (
          <p className="wa-empty-copy">No core-to-core PulseChain rotations found yet.</p>
        ) : (
          rotation.pairStats.slice(0, 6).map((pair) => {
            const drilldownSymbol = pair.boughtSymbol === 'PLS' ? pair.soldSymbol : pair.boughtSymbol;
            return (
              <article className="wa-rotation-row" key={pair.pair}>
                <div>
                  <strong>{pair.pair}</strong>
                  <p>
                    {pair.rotationCount} rotation{pair.rotationCount === 1 ? '' : 's'} · {fmtTok(pair.volumePls)} PLS notional
                  </p>
                </div>
                <div className="wa-rotation-row__meta">
                  <strong className={pair.realizedPnlPls >= 0 ? 'wa-value-up' : 'wa-value-down'}>
                    {formatSignedPls(pair.realizedPnlPls)}
                  </strong>
                  <button
                    type="button"
                    className="wa-inline-action"
                    onClick={() =>
                      onOpenTransactions({
                        kind: 'asset',
                        symbol: drilldownSymbol,
                        chain: 'pulsechain',
                        txType: 'swap',
                      })
                    }
                  >
                    Open flow
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {bestPair || worstPair ? (
        <div className="wa-rotation-notes">
          {bestPair ? (
            <p>
              Best realized route: <strong>{bestPair.pair}</strong> at {formatSignedPls(bestPair.realizedPnlPls)}.
            </p>
          ) : null}
          {worstPair ? (
            <p>
              Weakest route: <strong>{worstPair.pair}</strong> at {formatSignedPls(worstPair.realizedPnlPls)}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
