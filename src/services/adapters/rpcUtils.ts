/**
 * Shared low-level RPC primitives used by evmAdapter and pulsechainAdapter.
 * Centralising these avoids copy-paste drift between the two adapters.
 */

export const FETCH_TIMEOUT = 10_000;

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

/** Zero-pads an Ethereum address to a 32-byte (64 hex char) ABI word. */
export function padAddress(addr: string): string {
  return addr.replace('0x', '').padStart(64, '0');
}

/** Parses a hex-encoded uint256 RPC result to `bigint`. */
export function parseBigIntResult(hex: string | undefined): bigint {
  const normalized = (hex ?? '0x0').replace('0x', '') || '0';
  return BigInt(`0x${normalized}`);
}

type FetchLike = typeof fetch;

/**
 * Sends a JSON-RPC batch request to a single RPC endpoint.
 * Throws on non-2xx HTTP responses.
 */
export async function batchRpcCall(
  body: RpcBatchRequest[],
  rpc: string,
  fetchImpl: FetchLike,
): Promise<RpcBatchResponse[]> {
  const response = await fetchImpl(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }

  return response.json() as Promise<RpcBatchResponse[]>;
}

/**
 * Tries each RPC in `rpcs` in order, returning the first successful response.
 */
export async function batchRpcWithFallback(
  body: RpcBatchRequest[],
  rpcs: string[],
  fetchImpl: FetchLike,
): Promise<RpcBatchResponse[]> {
  let lastError: unknown;

  for (const rpc of rpcs) {
    try {
      return await batchRpcCall(body, rpc, fetchImpl);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('EVM batch RPC request failed');
}
