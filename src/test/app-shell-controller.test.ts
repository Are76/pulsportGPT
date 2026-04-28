import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_TAB_STORAGE_KEY,
  buildAppShellController,
  readStoredActiveTab,
} from '../features/app-shell/appShellController';

describe('appShellController', () => {
  afterEach(() => {
    window.localStorage.removeItem(ACTIVE_TAB_STORAGE_KEY);
  });

  it('maps legacy wallets tab state to assets', () => {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, 'wallets');

    expect(readStoredActiveTab()).toBe('assets');
  });

  it('builds mobile navigation buckets and active state', () => {
    const shell = buildAppShellController('history');

    expect(shell.pageMeta.history.title).toBe('Transactions');
    expect(shell.mobilePrimaryNavItems.map((item) => item.id)).toEqual([
      'home',
      'overview',
      'wallet-analyzer',
    ]);
    expect(shell.mobileMoreNavItems.map((item) => item.id)).toEqual([
      'stakes',
      'pulsechain-official',
      'history',
      'defi',
    ]);
    expect(shell.mobileMoreActive).toBe(true);
  });
});
