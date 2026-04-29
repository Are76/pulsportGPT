/**
 * Central registry of all localStorage keys used by PulsePort.
 *
 * Using typed constants instead of inline string literals prevents typos,
 * makes key auditing trivial, and simplifies cache-invalidation migrations.
 */
export const STORAGE_KEYS = {
  // Wallet list
  WALLETS: 'pulseport_wallets',

  // Portfolio data cache (used to avoid blank screen on reload)
  CACHE_ASSETS: 'pulseport_cache_assets',
  CACHE_STAKES: 'pulseport_cache_stakes',
  CACHE_LP: 'pulseport_cache_lp',
  CACHE_FARMS: 'pulseport_cache_farms',
  CACHE_TXS: 'pulseport_cache_txs',
  CACHE_WALLET_ASSETS: 'pulseport_cache_wallet_assets',
  CACHE_PRICES: 'pulseport_cache_prices',

  // History
  HISTORY: 'pulseport_history',

  // UI preferences
  HIDE_DUST: 'pulseport_hide_dust',
  HIDE_SPAM: 'pulseport_hide_spam',
  SPAM_TOKENS: 'pulseport_spam_tokens',
  HIDDEN_TOKENS: 'pulseport_hidden_tokens',
  HIDDEN_TXS: 'pulseport_hidden_txs',
  YIELD_UNIT: 'pulseport_yield_unit',
  MANUAL_ENTRIES: 'pulseport_manual_entries',
  COLLAPSED_SECTIONS: 'pulseport_collapsed',
  THEME: 'pulseport_theme',
  ACTIVE_TAB: 'pulseport_active_tab',

  // External API credentials
  ETHERSCAN_KEY: 'pulseport_etherscan_key',

  // User-managed custom coins
  CUSTOM_COINS: 'custom_coins',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
