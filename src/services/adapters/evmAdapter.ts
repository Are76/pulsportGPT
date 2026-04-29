import { formatUnits } from 'viem';
import { CHAINS, TOKENS } from '../../constants';
import type { Chain, TokenBalance } from '../../types';
import {
  batchRpcWithFallback,
  padAddress,
  parseBigIntResult,
  type RpcBatchRequest,
  type RpcBatchResponse,
} from './rpcUtils';

type FetchLike = typeof fetch;

export async function getEvmTokenBalances(
  chain: Extract<Chain, 'ethereum' | 'base'>,
  address: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenBalance[]> {
  const chainConfig = CHAINS[chain];
  const chainTokens = TOKENS[chain];
  const fallbackRpcs = 'fallbackRpcs' in chainConfig ? chainConfig.fallbackRpcs : [];
  const rpcs = [chainConfig.rpc, ...fallbackRpcs];

  const requests: RpcBatchRequest[] = chainTokens.map((token, index) => (
    token.address === 'native'
      ? {
          jsonrpc: '2.0',
          id: index + 1,
          method: 'eth_getBalance',
          params: [address, 'latest'],
        }
      : {
          jsonrpc: '2.0',
          id: index + 1,
          method: 'eth_call',
          params: [{ to: token.address, data: `0x70a08231${padAddress(address.toLowerCase())}` }, 'latest'],
        }
  ));

  const responses = await batchRpcWithFallback(requests, rpcs, fetchImpl);
  const resultsById = responses.reduce<Record<number, string>>((acc, response) => {
    acc[response.id] = response.result ?? '0x';
    return acc;
  }, {});

  return chainTokens.reduce<TokenBalance[]>((balances, token, index) => {
    const rawBalance = parseBigIntResult(resultsById[index + 1]);
    const balance = Number(formatUnits(rawBalance, token.decimals));
    const tokenRecord = token as Record<string, unknown>;
    const tokenName = typeof tokenRecord.name === 'string'
      ? tokenRecord.name
      : (token.symbol === 'ETH' ? 'Ethereum' : token.symbol);

    if (!(balance > 0)) {
      return balances;
    }

    balances.push({
      address: token.address.toLowerCase(),
      symbol: token.symbol,
      name: tokenName,
      decimals: token.decimals,
      balance,
      chain,
    });

    return balances;
  }, []);
}
