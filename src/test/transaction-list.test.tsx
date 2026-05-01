import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransactionList } from '../components/TransactionList';
import type { Asset, Transaction } from '../types';

describe('TransactionList', () => {
  it('falls back to the current asset price when transaction usd value is zero', () => {
    const tx: Transaction = {
      id: 'most-send',
      hash: '0xmost',
      timestamp: new Date('2026-01-23T12:00:00Z').getTime(),
      type: 'withdraw',
      from: '0xme',
      to: '0xyou',
      asset: 'MOST',
      amount: 15000,
      valueUsd: 0,
      chain: 'pulsechain',
    };

    const assets: Asset[] = [
      {
        id: 'most',
        symbol: 'MOST',
        name: 'MostWanted',
        balance: 15000,
        price: 0.007973,
        value: 119.595,
        chain: 'pulsechain',
      },
    ];

    render(<TransactionList transactions={[tx]} assets={assets} />);

    expect(screen.getByText('$119.59')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/jan 23, 2026/i));

    expect(screen.getAllByText('$119.59').length).toBeGreaterThan(1);
  });

  it('renders partial swap rows with swap detail instead of transfer detail', () => {
    const tx: Transaction = {
      id: 'partial-swap',
      hash: '0xswap',
      timestamp: new Date('2026-04-16T15:07:15Z').getTime(),
      type: 'withdraw',
      from: '0xme',
      to: '0xrouter',
      asset: 'DAI (FORK COPY)',
      amount: 25007.550628,
      valueUsd: 45.84,
      chain: 'pulsechain',
      swapLegOnly: true,
    };

    render(<TransactionList transactions={[tx]} assets={[]} />);

    fireEvent.click(screen.getByText(/apr 16, 2026/i));

    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText(/counterparty token was not returned by the explorer/i)).toBeInTheDocument();
    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
  });

  it('renders bridge and staking metadata in transfer detail', () => {
    const bridgeTx: Transaction = {
      id: 'bridge-metadata',
      hash: '0xbridge',
      timestamp: new Date('2026-04-24T12:00:00Z').getTime(),
      type: 'deposit',
      from: '0xbridge',
      to: '0xme',
      asset: 'USDC',
      amount: 250,
      valueUsd: 250,
      chain: 'pulsechain',
      bridged: true,
      bridge: {
        originChain: 'base',
        protocol: 'official',
      },
    };

    const stakeTx: Transaction = {
      id: 'stake-metadata',
      hash: '0xstake',
      timestamp: new Date('2026-04-24T13:00:00Z').getTime(),
      type: 'withdraw',
      from: '0xme',
      to: '0xhex',
      asset: 'HEX',
      amount: 10000,
      chain: 'pulsechain',
      staking: {
        protocol: 'hex',
        action: 'stakeStart',
      },
    };

    const { rerender } = render(<TransactionList transactions={[bridgeTx]} assets={[]} />);

    fireEvent.click(screen.getByText(/apr 24, 2026/i));
    expect(screen.getByText('Bridge')).toBeInTheDocument();
    expect(screen.getByText('Base via official')).toBeInTheDocument();

    rerender(<TransactionList transactions={[stakeTx]} assets={[]} />);
    fireEvent.click(screen.getByText(/apr 24, 2026/i));
    expect(screen.getByText('Staking')).toBeInTheDocument();
    expect(screen.getByText('HEX stakeStart')).toBeInTheDocument();
  });

  it('opens provenance for transaction amounts and metadata', () => {
    const tx: Transaction = {
      id: 'bridge-metadata',
      hash: '0xbridge',
      timestamp: new Date('2026-04-24T12:00:00Z').getTime(),
      type: 'deposit',
      from: '0xbridge',
      to: '0xme',
      asset: 'USDC',
      amount: 250,
      valueUsd: 250,
      chain: 'pulsechain',
      bridged: true,
      bridge: {
        originChain: 'base',
        protocol: 'official',
      },
    };

    render(<TransactionList transactions={[tx]} assets={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /open source details for usdc amount/i }));
    expect(screen.getByRole('dialog', { name: /usdc amount provenance/i })).toBeInTheDocument();
    expect(screen.getByText(/normalized on-chain transaction record/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/apr 24, 2026/i));
    fireEvent.click(screen.getByRole('button', { name: /open source details for bridge metadata/i }));
    expect(screen.getByRole('dialog', { name: /bridge metadata provenance/i })).toBeInTheDocument();
    expect(screen.getByText(/bridge metadata normalized from the selected transaction/i)).toBeInTheDocument();
  });

  it('renders preserved contract interactions', () => {
    const tx: Transaction = {
      id: 'approval-interaction',
      hash: '0xapproval',
      timestamp: new Date('2026-04-29T12:00:00Z').getTime(),
      type: 'interaction',
      from: '0xme',
      to: '0xcontract',
      asset: 'ETH',
      amount: 0,
      valueUsd: 0,
      chain: 'ethereum',
    };

    render(<TransactionList transactions={[tx]} assets={[]} />);

    expect(screen.getByText('Call')).toBeInTheDocument();
    expect(screen.getByText(/contract call to/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/apr 29, 2026/i));
    expect(screen.getByText(/contract interaction/i)).toBeInTheDocument();
  });

  it('renders large ledgers progressively when an initial window is provided', () => {
    const transactions: Transaction[] = Array.from({ length: 5 }, (_, index) => ({
      id: `tx-${index}`,
      hash: `0x${index}`,
      timestamp: new Date(`2026-04-2${index}T12:00:00Z`).getTime(),
      type: 'deposit',
      from: '0xexternal',
      to: '0xwallet',
      asset: `TOK${index}`,
      amount: index + 1,
      valueUsd: index + 1,
      chain: 'pulsechain',
    }));

    render(
      <TransactionList
        transactions={transactions}
        assets={[]}
        initialVisibleCount={2}
        loadMoreCount={2}
      />,
    );

    expect(screen.getByText(/showing 2 of 5 transactions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open source details for tok0 amount/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open source details for tok1 amount/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open source details for tok2 amount/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /load 2 more/i }));

    expect(screen.getByText(/showing 4 of 5 transactions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open source details for tok3 amount/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /load 1 more/i }));

    expect(screen.getByRole('button', { name: /open source details for tok4 amount/i })).toBeInTheDocument();
    expect(screen.queryByText(/showing 4 of 5 transactions/i)).not.toBeInTheDocument();
  });
});
