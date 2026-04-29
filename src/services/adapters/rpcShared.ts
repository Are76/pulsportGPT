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

export function padAddress(addr: string): string {
  return addr.replace('0x', '').padStart(64, '0');
}

export function parseBigIntResult(hex: string | undefined): bigint {
  const normalized = (hex ?? '0x0').replace('0x', '') || '0';
  return BigInt(`0x${normalized}`);
}
