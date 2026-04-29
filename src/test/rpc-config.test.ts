import { describe, expect, it } from 'vitest';
import { CHAINS } from '../constants';

describe('shared RPC configuration', () => {
  it('keeps PulseChain browser-safe fallback RPCs ahead of analytics work', () => {
    expect(CHAINS.pulsechain.rpc).toBe('https://rpc-pulsechain.g4mm4.io');
    expect(CHAINS.pulsechain.fallbackRpcs).toEqual([
      'https://rpc.pulsechain.com',
      'https://pulsechain-rpc.publicnode.com',
    ]);
  });

  it('prefers stable Ethereum browser fallbacks before rate-limited ones', () => {
    expect(CHAINS.ethereum.rpc).toBe('https://ethereum-rpc.publicnode.com');
    expect(CHAINS.ethereum.fallbackRpcs).toEqual([
      'https://eth.drpc.org',
    ]);
  });
});
