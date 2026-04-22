import React, { useEffect, useCallback, useState } from 'react';
import { X, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Search, Link2, List } from 'lucide-react';

// -- helpers ------------------------------------------------------------------

function fmtPrice(p: number | string | null | undefined): string {
  const n = typeof p === 'string' ? parseFloat(p) : (p ?? 0);
  if (!n || isNaN(n)) return '-';
  if (n < 0.000001) return `$${n.toFixed(10)}`;
  if (n < 0.0001)   return `$${n.toFixed(8)}`;
  if (n < 0.01)     return `$${n.toFixed(6)}`;
  if (n < 1)        return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

function fmtUsd(v: number | null | undefined): string {
  if (!v || isNaN(v)) return '-';
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3)  return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// -- core PulseChain token addresses to seed the watchlist --------------------

const CORE_TOKENS = [
  { chainId: 'pulsechain', address: '0xa1077a294dde1b09bb078844df40758a5d0f9a27', symbol: 'PLS',  name: 'PulseChain' },
  { chainId: 'pulsechain', address: '0x95b303987a60c71504d99aa1b13b4da07b0790ab', symbol: 'PLSX', name: 'PulseX' },
  { chainId: 'pulsechain', address: '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d', symbol: 'INC',  name: 'Incentive' },
  { chainId: 'pulsechain', address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', symbol: 'HEX',  name: 'HEX' },
  { chainId: 'pulsechain', address: '0xf6f8db0aba00007681f8faf16a0fda1c9b030b11', symbol: 'PRVX', name: 'PrivacyX' },
  { chainId: 'pulsechain', address: '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c', symbol: 'WETH', name: 'Wrapped Ether from Ethereum' },
  { chainId: 'pulsechain', address: '0xb17d901469b9208b17d916112988a3fed19b5ca1', symbol: 'WBTC', name: 'Wrapped BTC from Ethereum' },
  { chainId: 'ethereum', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH', name: 'Wrapped Ether' },
  { chainId: 'ethereum', address: '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39', symbol: 'eHEX', name: 'HEX on Ethereum' },
  { chainId: 'ethereum', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin' },
  { chainId: 'ethereum', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether USD' },
  { chainId: 'base', address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether on Base' },
  { chainId: 'base', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913'.toLowerCase(), symbol: 'USDC', name: 'USD Coin on Base' },
];

const coreKey = (chainId: string, address: string) => `${chainId}:${address.toLowerCase()}`;
const CORE_TOKEN_BY_CHAIN_ADDRESS = new Map(CORE_TOKENS.map(t => [coreKey(t.chainId, t.address), t]));

// -- types ---------------------------------------------------------------------

interface WatchPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string };
  priceUsd: string | null;
  priceChange: { h1: number | null; h24: number | null };
  volume24h: number;
  liquidityUsd: number;
  marketCap: number | null;
  fdv: number | null;
  txns24h: number;
  imageUrl: string | null;
  dexScreenerUrl: string;
}

// -- props ---------------------------------------------------------------------

interface Props {
  theme: 'dark' | 'light';
  onClose: () => void;
  initialSearch?: string;
}

type SortKey = 'volume' | 'liquidity' | 'mcap' | 'change24h';
const SUPPORTED_MARKET_CHAINS = new Set(['pulsechain', 'ethereum', 'base']);
const CHAIN_LABELS: Record<string, string> = {
  pulsechain: 'PulseChain',
  ethereum: 'Ethereum',
  base: 'Base',
};

// -- component -----------------------------------------------------------------

// -- Watchlist URL parser ------------------------------------------------------
// Returns one of:
//   { type: 'pairs';   entries }   - pair addresses embedded directly (?watchlist= format)
//   { type: 'shareId'; shareId }   - opaque share-link ID (/watchlist/{id} format)
//   null                            - unrecognised input

type ParsedWatchlistUrl =
  | { type: 'pairs';   entries: { chainId: string; pairAddr: string }[] }
  | { type: 'shareId'; shareId: string };

function parseWatchlistUrl(raw: string): ParsedWatchlistUrl | null {
  try {
    const url = new URL(raw.trim());

    // -- Format A: https://dexscreener.com/watchlist/{shareId}  (new share-link) --
    const pathMatch = url.pathname.match(/^\/watchlist\/([A-Za-z0-9_-]{4,100})$/);
    if (pathMatch) {
      return { type: 'shareId', shareId: pathMatch[1] };
    }

    // -- Format B: ?watchlist=chainId_0xADDR,...  (legacy copy-link / export) --
    let wl = url.searchParams.get('watchlist');
    if (!wl && url.hash) {
      try {
        const qMark = url.hash.indexOf('?');
        if (qMark !== -1) {
          const hashSearch = new URLSearchParams(url.hash.slice(qMark + 1));
          wl = hashSearch.get('watchlist');
        }
      } catch { /* ignore */ }
    }
    if (wl) {
      const entries = wl.split(',').flatMap(s => {
        const trimmed = s.trim();
        const under = trimmed.indexOf('_');
        if (under < 1) return [];
        const chainId  = trimmed.slice(0, under).toLowerCase();
        const pairAddr = trimmed.slice(under + 1).toLowerCase();
        if (!chainId || !pairAddr) return [];
        return [{ chainId, pairAddr }];
      });
      if (entries.length > 0) return { type: 'pairs', entries };
    }

    return null;
  } catch {
    return null;
  }
}

// -- Resolve a DexScreener share-link ID -> pair addresses ----------------------
// DexScreener's internal API (io.dexscreener.com) is CORS-blocked in browsers.
// We try the public api.dexscreener.com endpoints first, then fall back.
// On total failure we throw DS_SHARE_UNAVAILABLE so the caller can show a clean
// "Open in DexScreener" button instead of a confusing error.
async function fetchByShareId(shareId: string): Promise<{ chainId: string; pairAddr: string }[]> {
  const ENDPOINTS = [
    // Public API - same domain as other DexScreener API calls, likely CORS-allowed
    `https://api.dexscreener.com/watchlist/v1/share/${shareId}`,
    `https://api.dexscreener.com/watchlist/v2/share/${shareId}`,
    // Internal endpoints - may work in some environments (Vercel server-side, etc.)
    `https://io.dexscreener.com/dex/watchlist/v1/share/${shareId}`,
    `https://io.dexscreener.com/dex/watchlist/v2/share/${shareId}`,
    `https://io.dexscreener.com/dex/watchlist/share/${shareId}`,
  ];

  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = await res.json();

      // Normalise every known response shape DexScreener might return
      let rawItems: any[] =
        (Array.isArray(data)                    ? data                    : null) ??
        (Array.isArray(data.pairs)              ? data.pairs              : null) ??
        (Array.isArray(data.items)              ? data.items              : null) ??
        (Array.isArray(data.watchlist)          ? data.watchlist          : null) ??
        (Array.isArray(data.data?.pairs)        ? data.data.pairs         : null) ??
        (Array.isArray(data.watchlist?.pairs)   ? data.watchlist.pairs    : null) ??
        (Array.isArray(data.watchlist?.items)   ? data.watchlist.items    : null) ??
        [];

      const entries: { chainId: string; pairAddr: string }[] = [];

      for (const item of rawItems) {
        if (typeof item === 'string') {
          // "chainId_0xpairAddr" string format
          const under = item.indexOf('_');
          if (under > 0) {
            entries.push({ chainId: item.slice(0, under).toLowerCase(), pairAddr: item.slice(under + 1).toLowerCase() });
          }
        } else if (typeof item === 'object' && item !== null) {
          const chain = (item.chainId ?? item.chain ?? 'pulsechain').toString().toLowerCase();
          // Some responses contain tokenAddress instead of pairAddress
          const addr = (item.pairAddress ?? item.address ?? item.tokenAddress ?? '').toString().toLowerCase();
          if (addr.length > 10) {
            entries.push({ chainId: chain, pairAddr: addr });
          }
        }
      }

      if (entries.length > 0) return entries;
    } catch { /* try next endpoint */ }
  }

  // All endpoints exhausted
  throw Object.assign(new Error('ds-share-unavailable'), { code: 'DS_SHARE_UNAVAILABLE' });
}

export function MarketWatchModal({ theme, onClose, initialSearch = '' }: Props) {
  const [pairs, setPairs]       = useState<WatchPair[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState(initialSearch);
  const [searchPairs, setSearchPairs] = useState<WatchPair[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sortBy, setSortBy]     = useState<SortKey>('volume');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Watchlist import state
  const [showImport, setShowImport]         = useState(false);
  const [importUrl, setImportUrl]           = useState('');
  const [importLoading, setImportLoading]   = useState(false);
  const [importError, setImportError]       = useState<string | null>(null);
  const [importShareId, setImportShareId]   = useState<string | null>(null); // original share ID for "Open in DexScreener"
  const [watchlistPairs, setWatchlistPairs] = useState<WatchPair[] | null>(null);

  const green = theme === 'dark' ? '#00FF9F' : '#059669';
  const red   = theme === 'dark' ? '#f43f5e' : '#dc2626';

  function tokenAddress(token?: { address?: string } | null) {
    return token?.address?.toLowerCase?.() ?? '';
  }

  function rawPairToWatchPair(p: any, trackedAddress?: string): WatchPair {
    const chainId = p.chainId ?? 'pulsechain';
    const tracked = trackedAddress ? CORE_TOKEN_BY_CHAIN_ADDRESS.get(coreKey(chainId, trackedAddress)) : null;
    const baseToken = {
      address: p.baseToken?.address,
      symbol: tracked?.symbol ?? p.baseToken?.symbol ?? 'TOKEN',
      name: tracked?.name ?? p.baseToken?.name ?? 'Unknown token',
    };

    return {
      chainId,
      pairAddress: p.pairAddress,
      baseToken,
      quoteToken: p.quoteToken,
      priceUsd: p.priceUsd ?? null,
      priceChange: {
        h1:  p.priceChange?.h1  ?? null,
        h24: p.priceChange?.h24 ?? null,
      },
      volume24h:    p.volume?.h24 ?? 0,
      liquidityUsd: p.liquidity?.usd ?? 0,
      marketCap:    p.marketCap ?? p.fdv ?? null,
      fdv:          p.fdv ?? null,
      txns24h:      (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
      imageUrl:     p.info?.imageUrl ?? null,
      dexScreenerUrl: p.url ?? `https://dexscreener.com/${p.chainId ?? 'pulsechain'}/${p.pairAddress}`,
    };
  }

  function bestCorePairs(rawPairs: any[]): WatchPair[] {
    const selected = new Map<string, any>();
    const trackedKeys = new Set(CORE_TOKENS.map(t => coreKey(t.chainId, t.address)));

    for (const p of rawPairs) {
      if (!SUPPORTED_MARKET_CHAINS.has(p.chainId) || !p.pairAddress) continue;
      const baseAddress = tokenAddress(p.baseToken);
      const key = coreKey(p.chainId, baseAddress);
      if (!trackedKeys.has(key)) continue;

      const current = selected.get(key);
      const score = (p.liquidity?.usd ?? 0) + ((p.volume?.h24 ?? 0) * 0.35);
      const currentScore = current ? (current.liquidity?.usd ?? 0) + ((current.volume?.h24 ?? 0) * 0.35) : -1;
      if (!current || score > currentScore) {
        selected.set(key, p);
      }
    }

    return CORE_TOKENS
      .map(token => {
        const raw = selected.get(coreKey(token.chainId, token.address));
        return raw ? rawPairToWatchPair(raw, token.address) : null;
      })
      .filter((pair): pair is WatchPair => Boolean(pair));
  }

  async function fetchDexTokenPairs(tokens: typeof CORE_TOKENS): Promise<any[]> {
    const raw: any[] = [];
    const byChain = tokens.reduce<Record<string, string[]>>((acc, token) => {
      (acc[token.chainId] ||= []).push(token.address);
      return acc;
    }, {});

    for (const [chainId, addresses] of Object.entries(byChain)) {
      for (let i = 0; i < addresses.length; i += 30) {
        const chunk = addresses.slice(i, i + 30);
        const tokenV1 = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${chunk.join(',')}`);
        if (tokenV1.ok) {
          const data = await tokenV1.json();
          if (Array.isArray(data)) {
            raw.push(...data);
            continue;
          }
          if (Array.isArray(data.pairs)) {
            raw.push(...data.pairs);
            continue;
          }
        }

        const legacy = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`);
        if (legacy.ok) {
          const data = await legacy.json();
          if (Array.isArray(data.pairs)) raw.push(...data.pairs);
        }
      }
    }
    return raw;
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // DexScreener silently truncates results at 30 tokens per request.
      // Chunk core tokens per chain so PulseChain, Ethereum and Base all load.
      const rawPairs = await fetchDexTokenPairs(CORE_TOKENS);
      const result = bestCorePairs(rawPairs);
      setPairs(result);
      setLastRefresh(new Date());
      if (result.length === 0) {
        setError('DexScreener returned no core pairs.');
      }
    } catch (e) {
      setError('Failed to load market data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || watchlistPairs) {
      setSearchPairs([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
        const data = await res.json();
        const marketPairs = (Array.isArray(data.pairs) ? data.pairs : [])
          .filter((p: any) => SUPPORTED_MARKET_CHAINS.has(p.chainId) && p.pairAddress && p.baseToken?.symbol)
          .sort((a: any, b: any) => ((b.liquidity?.usd ?? 0) + (b.volume?.h24 ?? 0) * 0.35) - ((a.liquidity?.usd ?? 0) + (a.volume?.h24 ?? 0) * 0.35));

        const qLower = q.toLowerCase();
        const normalized: WatchPair[] = marketPairs
          .filter((pair: any) => {
            const baseSymbol = pair.baseToken?.symbol?.toLowerCase?.() ?? '';
            const baseName = pair.baseToken?.name?.toLowerCase?.() ?? '';
            const quoteSymbol = pair.quoteToken?.symbol?.toLowerCase?.() ?? '';
            const pairLabel = `${baseSymbol}/${quoteSymbol}`;
            const chainLabel = CHAIN_LABELS[pair.chainId]?.toLowerCase?.() ?? pair.chainId ?? '';
            return baseSymbol.includes(qLower) || baseName.includes(qLower) || pairLabel.includes(qLower) || chainLabel.includes(qLower);
          })
          .slice(0, 50)
          .map((pair: any) => rawPairToWatchPair(pair));
        setSearchPairs(normalized);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setSearchPairs([]);
          setSearchError('Search failed. Try again in a moment.');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, watchlistPairs]);

  // Keyboard close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // -- Import a shared DexScreener watchlist -----------------------------------
  // Core import logic - accepts the URL string directly so it can be called
  // both by the button click handler and by the onPaste auto-submit.
  const runImport = useCallback(async (urlStr: string) => {
    const parsed = parseWatchlistUrl(urlStr);
    if (!parsed) {
      setImportError('Unrecognised link. Paste a full DexScreener URL like dexscreener.com/watchlist/...');
      return;
    }

    setImportLoading(true);
    setImportError(null);
    setImportShareId(null);

    try {
      let entries: { chainId: string; pairAddr: string }[];

      // -- Resolve share-link ID to pair addresses --------------------------
      if (parsed.type === 'shareId') {
        setImportShareId(parsed.shareId);
        try {
          entries = await fetchByShareId(parsed.shareId);
        } catch (err: any) {
          if (err?.code === 'DS_SHARE_UNAVAILABLE') {
            setImportError('DS_SHARE_UNAVAILABLE');
          } else {
            setImportError('Network error loading the watchlist. Please check your connection and try again.');
          }
          return;
        }
      } else {
        entries = parsed.entries;
      }

      // -- Fetch full pair data for each entry ------------------------------
      const byChain = new Map<string, string[]>();
      for (const { chainId, pairAddr } of entries) {
        if (!byChain.has(chainId)) byChain.set(chainId, []);
        byChain.get(chainId)!.push(pairAddr);
      }
      const raw: any[] = [];
      const failedChains: string[] = [];
      await Promise.all(
        Array.from(byChain.entries()).map(async ([chainId, addrs]) => {
          for (let i = 0; i < addrs.length; i += 30) {
            const sliceAddrs = addrs.slice(i, i + 30);
            const sliceStr = sliceAddrs.join(',');
            try {
              // Per-slice heuristic: if every address in this slice is a 42-char 0x address
              // it could be either a pair or token address. Try pairs API first; if it returns
              // no results, fall back to the tokens API so token-address watchlists also work.
              const looksLike0x = sliceAddrs.every(a => a.length === 42 && a.startsWith('0x'));
              const pairsRes = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chainId}/${sliceStr}`);
              if (pairsRes.ok) {
                const d = await pairsRes.json();
                const got = Array.isArray(d.pairs) ? d.pairs : (d.pair ? [d.pair] : []);
                if (got.length > 0) { raw.push(...got); continue; }
              }
              // No pairs found - try token-address endpoint as fallback
              if (looksLike0x) {
                const tokRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${sliceStr}`);
                if (tokRes.ok) {
                  const d = await tokRes.json();
                  if (Array.isArray(d.pairs)) raw.push(...d.pairs);
                  else if (d.pair)            raw.push(d.pair);
                } else {
                  failedChains.push(chainId);
                }
              } else {
                failedChains.push(chainId);
              }
            } catch {
              failedChains.push(chainId);
            }
          }
        })
      );

      if (raw.length === 0) {
        setImportError('No pairs found for this watchlist. The link may be expired or contain no pairs.');
        return;
      }

      setWatchlistPairs(raw.map(p => rawPairToWatchPair(p)));

      if (failedChains.length > 0) {
        const unique = [...new Set(failedChains)].join(', ');
        setImportError(`Loaded ${raw.length} pair${raw.length !== 1 ? 's' : ''} - some chains failed: ${unique}`);
        setShowImport(true);
      } else {
        setShowImport(false);
        setImportUrl('');
      }
    } catch {
      setImportError('Failed to fetch watchlist pairs. Please check the link and try again.');
    } finally {
      setImportLoading(false);
    }
  }, []);  // no deps - uses only setters and module-level helpers

  // Thin wrapper so the Load button can call without passing a URL argument
  function importWatchlist() { runImport(importUrl.trim()); }

  function clearWatchlist() {
    setWatchlistPairs(null);
    setSearch('');
  }

  // Source list - either the imported watchlist or the default PulseChain pairs
  const activePairs = watchlistPairs ?? (search.trim().length >= 2 ? searchPairs : pairs);

  // Filter + sort
  const displayed = React.useMemo(() => {
    let list = activePairs;
    if (search.trim() && (watchlistPairs || search.trim().length < 2)) {
      const q = search.trim().toUpperCase();
      list = list.filter(p =>
        p.baseToken.symbol.toUpperCase().includes(q) ||
        p.baseToken.name.toUpperCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'volume')    return b.volume24h - a.volume24h;
      if (sortBy === 'liquidity') return b.liquidityUsd - a.liquidityUsd;
      if (sortBy === 'mcap')      return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      if (sortBy === 'change24h') return (b.priceChange.h24 ?? -Infinity) - (a.priceChange.h24 ?? -Infinity);
      return 0;
    });
  }, [activePairs, search, sortBy, watchlistPairs]);

  const SORT_OPTS: { key: SortKey; label: string }[] = [
    { key: 'volume',    label: 'Volume' },
    { key: 'liquidity', label: 'Liquidity' },
    { key: 'mcap',      label: 'Market Cap' },
    { key: 'change24h', label: '24h Change' },
  ];

  function ChangeCell({ val }: { val: number | null }) {
    if (val == null) return <span style={{ color: 'var(--fg-subtle)' }}>-</span>;
    const color = val >= 0 ? green : red;
    const Icon  = val >= 0 ? TrendingUp : TrendingDown;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontWeight: 700, fontFamily: 'var(--font-shell-display)' }}>
        <Icon size={11} />
        {val >= 0 ? '+' : ''}{val.toFixed(2)}%
      </span>
    );
  }

  return (
    <div className="mwm-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mwm-panel" role="dialog" aria-modal="true" aria-label="Market Watch">

        {/* -- Header -- */}
        <div className="mwm-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="mwm-pulse-dot" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
                Market Watch
              </div>
              {(() => {
                const subtitle = watchlistPairs
                  ? 'Imported watchlist · DexScreener'
                  : `PulseChain, Ethereum & Base · live data from DexScreener${lastRefresh ? ' · updated ' + lastRefresh.toLocaleTimeString() : ''}`;
                return (
                  <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 1 }}>{subtitle}</div>
                );
              })()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Import watchlist toggle */}
            <button
              className={`mwm-icon-btn${showImport ? ' mwm-icon-btn-active' : ''}`}
              onClick={() => { setShowImport(v => !v); setImportError(null); }}
              title="Import DexScreener watchlist link"
            >
              <Link2 size={15} />
            </button>
            {!watchlistPairs && (
              <button className="mwm-icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                <RefreshCw size={15} className={loading ? 'mwm-spin' : ''} />
              </button>
            )}
            <button className="mwm-close-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* -- Import row -- */}
        {showImport && (
          <div className="mwm-import-row">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              Paste a DexScreener watchlist link
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input
                className="mwm-import-input"
                placeholder="https://dexscreener.com/watchlist/..."
                value={importUrl}
                onChange={e => {
                  setImportUrl(e.target.value);
                  setImportError(null);
                  setImportShareId(null);
                }}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text').trim();
                  if (pasted.startsWith('http')) {
                    // Set URL state and immediately run import with the pasted value
                    // (can't rely on importUrl state since it hasn't updated yet)
                    setImportUrl(pasted);
                    setImportError(null);
                    setImportShareId(null);
                    e.preventDefault();
                    runImport(pasted);
                  }
                }}
                onKeyDown={e => { if (e.key === 'Enter') importWatchlist(); }}
                autoFocus
              />
              <button
                className="mwm-sort-btn active"
                style={{ flexShrink: 0, height: 36, paddingLeft: 16, paddingRight: 16 }}
                onClick={importWatchlist}
                disabled={importLoading || !importUrl.trim()}
              >
                {importLoading ? <span className="mwm-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : 'Load'}
              </button>
            </div>
            {/* Error state */}
            {importError && importError !== 'DS_SHARE_UNAVAILABLE' && (
              <div style={{ fontSize: 11, color: red, marginTop: 6, lineHeight: 1.5 }}>{importError}</div>
            )}
            {importError === 'DS_SHARE_UNAVAILABLE' && (
              <div className="mwm-import-help">
                <div className="mwm-import-help-title">
                  Browser import is blocked
                </div>
                <div className="mwm-import-help-text">
                  DexScreener does not allow apps to read private share links from the browser. Open it there, or paste an export link with pair addresses.
                </div>
                <a
                  href={`https://dexscreener.com/watchlist/${importShareId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mwm-import-help-link"
                >
                  <ExternalLink size={12} /> Open watchlist on DexScreener
                </a>
              </div>
            )}
            {!importError && (
              <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 6, lineHeight: 1.5 }}>
                Supports <code className="mwm-code">/watchlist/{'{'}id{'}'}</code> share links and <code className="mwm-code">?watchlist=</code> export links
              </div>
            )}
          </div>
        )}

        {/* -- Imported watchlist banner -- */}
        {watchlistPairs && (
          <div className="mwm-watchlist-banner">
            <List size={13} style={{ flexShrink: 0 }} />
            <span>Showing imported watchlist &mdash; {watchlistPairs.length} pair{watchlistPairs.length !== 1 ? 's' : ''}</span>
            <button className="mwm-banner-clear" onClick={clearWatchlist}>
              <X size={11} style={{ marginRight: 3 }} /> Clear
            </button>
          </div>
        )}

        {/* -- Toolbar -- */}
        <div className="mwm-toolbar">
          {/* Sort pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SORT_OPTS.map(({ key, label }) => (
              <button key={key} className={`mwm-sort-btn${sortBy === key ? ' active' : ''}`}
                onClick={() => setSortBy(key)}>
                {label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)', pointerEvents: 'none' }} />
            <input
              className="mwm-search"
              placeholder="Search token..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* -- Body -- */}
        <div className="mwm-body">
          {searchLoading && !watchlistPairs && (
            <div className="mwm-search-status">
              <div className="mwm-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <span>Searching PulseChain, Ethereum and Base pairs...</span>
            </div>
          )}

          {searchError && !searchLoading && !watchlistPairs && (
            <div className="mwm-search-status mwm-search-status-error">
              {searchError}
            </div>
          )}

          {loading && !watchlistPairs && pairs.length === 0 && (
            <div className="mwm-state-center">
              <div className="mwm-spinner" />
              <div style={{ marginTop: 14, fontSize: 13, color: 'var(--fg-subtle)' }}>Loading market data...</div>
            </div>
          )}

          {error && !loading && !watchlistPairs && (
            <div className="mwm-state-center">
              <div style={{ fontSize: 13, color: red, marginBottom: 12 }}>{error}</div>
              <button className="mwm-sort-btn active" onClick={fetchData}>Retry</button>
            </div>
          )}

          {!loading && displayed.length === 0 && (
            <div className="mwm-state-center">
              <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                {search ? `No tokens match "${search}"` : 'No data available'}
              </div>
            </div>
          )}

          {displayed.length > 0 && (
            <div className="mwm-table-wrap">
              <table className="mwm-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Token</th>
                    <th className="mwm-th-right">Price</th>
                    <th className="mwm-th-right mwm-col-hide-xs">1h</th>
                    <th className="mwm-th-right">24h</th>
                    <th className="mwm-th-right mwm-col-hide-sm">Volume 24h</th>
                    <th className="mwm-th-right mwm-col-hide-sm">Liquidity</th>
                    <th className="mwm-th-right mwm-col-hide-xs">Market Cap</th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((p, i) => (
                    <tr key={p.pairAddress} className="mwm-row">
                      <td className="mwm-rank">{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="mwm-token-icon">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.baseToken.symbol}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : p.baseToken.symbol[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.2 }}>
                              {p.baseToken.symbol}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', lineHeight: 1.3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.baseToken.name}
                              <span style={{ marginLeft: 4, opacity: 0.55 }}>/{p.quoteToken.symbol}</span>
                              <span style={{ marginLeft: 6, opacity: 0.75 }}>· {CHAIN_LABELS[p.chainId] ?? p.chainId}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mwm-td-mono mwm-td-right">{fmtPrice(p.priceUsd)}</td>
                      <td className="mwm-td-right mwm-col-hide-xs"><ChangeCell val={p.priceChange.h1} /></td>
                      <td className="mwm-td-right"><ChangeCell val={p.priceChange.h24} /></td>
                      <td className="mwm-td-mono mwm-td-right mwm-col-hide-sm">{fmtUsd(p.volume24h)}</td>
                      <td className="mwm-td-mono mwm-td-right mwm-col-hide-sm" style={{ color: p.liquidityUsd > 0 ? green : undefined }}>
                        {fmtUsd(p.liquidityUsd)}
                      </td>
                      <td className="mwm-td-mono mwm-td-right mwm-col-hide-xs">{fmtUsd(p.marketCap)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <a href={p.dexScreenerUrl} target="_blank" rel="noopener noreferrer"
                          className="mwm-ds-link" title="Open on DexScreener">
                          <ExternalLink size={13} />
                          <span>Dex</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* -- Footer -- */}
        <div className="mwm-footer">
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            {displayed.length} token{displayed.length !== 1 ? 's' : ''} · Data from DexScreener
            {!watchlistPairs && ' · PulseChain / Ethereum / Base'}
          </span>
          <button className="tcm-close-text-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
