import { describe, expect, it } from 'vitest';
import {
  FETCH_TIMEOUT_MS,
  padAddress,
  parseBigIntResult,
} from '../services/adapters/rpcShared';

describe('rpcShared', () => {
  describe('FETCH_TIMEOUT_MS', () => {
    it('is a positive number', () => {
      expect(typeof FETCH_TIMEOUT_MS).toBe('number');
      expect(FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('equals 10,000 milliseconds', () => {
      expect(FETCH_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe('padAddress', () => {
    it('pads a short hex address without 0x prefix to 64 characters', () => {
      expect(padAddress('abc')).toBe('abc'.padStart(64, '0'));
      expect(padAddress('abc')).toHaveLength(64);
    });

    it('strips the 0x prefix before padding', () => {
      const result = padAddress('0xdeadbeef');
      expect(result.startsWith('0x')).toBe(false);
      expect(result).toBe('deadbeef'.padStart(64, '0'));
    });

    it('handles a full 40-character Ethereum address (with 0x)', () => {
      const addr = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';
      const result = padAddress(addr);
      expect(result).toHaveLength(64);
      expect(result).toBe('2b591e99afe9f32eaa6214f7b7629768c40eeb39'.padStart(64, '0'));
    });

    it('does not change a string that is already 64 characters', () => {
      const full = '0'.repeat(64);
      expect(padAddress(full)).toBe(full);
    });

    it('pads an empty string to 64 zeros', () => {
      expect(padAddress('')).toBe('0'.repeat(64));
    });

    it('handles address without 0x prefix', () => {
      const addr = 'abcdef';
      expect(padAddress(addr)).toBe(addr.padStart(64, '0'));
    });
  });

  describe('parseBigIntResult', () => {
    it('parses a hex string with 0x prefix', () => {
      expect(parseBigIntResult('0x1a')).toBe(BigInt(26));
    });

    it('parses a hex string without 0x prefix', () => {
      expect(parseBigIntResult('1a')).toBe(BigInt(26));
    });

    it('returns 0n when the input is undefined', () => {
      expect(parseBigIntResult(undefined)).toBe(BigInt(0));
    });

    it('returns 0n for "0x0"', () => {
      expect(parseBigIntResult('0x0')).toBe(BigInt(0));
    });

    it('returns 0n for "0x"', () => {
      expect(parseBigIntResult('0x')).toBe(BigInt(0));
    });

    it('returns 0n for an empty string', () => {
      expect(parseBigIntResult('')).toBe(BigInt(0));
    });

    it('handles large hex values representing wei balances', () => {
      // 1 ETH = 1e18 wei = 0xde0b6b3a7640000
      const oneEthInWei = BigInt('1000000000000000000');
      expect(parseBigIntResult('0xde0b6b3a7640000')).toBe(oneEthInWei);
    });

    it('parses pure numeric hex strings', () => {
      expect(parseBigIntResult('0xff')).toBe(BigInt(255));
      expect(parseBigIntResult('ff')).toBe(BigInt(255));
    });
  });
});