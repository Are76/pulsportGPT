export const SHELL_VIEWS = [
  'dashboard',
  'portfolio',
  'wallet-analyzer',
  'investments',
  'transactions',
  'staking',
  'wallets-bridges',
  'ecosystem',
] as const;

export type ShellView = (typeof SHELL_VIEWS)[number];

export type ShellNavItem = {
  id: ShellView;
  label: string;
  shortLabel: string;
};
