export interface RpcBatchRequest {
  jsonrpc: '2.0';
  id: number;
  method: 'eth_getBalance' | 'eth_call';
  params: unknown[];
}

export interface RpcBatchResponse {
  id: number;
  result?: string;
}

export const FETCH_TIMEOUT_MS = 10_000;

/**
 * Normalize an Ethereum hex address to a 64-character, left-zero-padded hex string without the `0x` prefix.
 *
 * @param addr - An Ethereum-style hex address which may include a `0x` prefix
 * @returns The address as a 64-character hex string, left-padded with `0` and without a `0x` prefix
 */
export function padAddress(addr: string): string {
  return addr.replace('0x', '').padStart(64, '0');
}

/**
 * Parses an optional hex-encoded RPC numeric result into a bigint.
 *
 * @param hex - Hex string with optional `0x` prefix, empty string, or `undefined`; missing or empty value is treated as zero.
 * @returns The parsed numeric value as a `bigint`.
 */
export function parseBigIntResult(hex: string | undefined): bigint {
  const normalized = (hex ?? '0x0').replace('0x', '') || '0';
  return BigInt(`0x${normalized}`);
}
