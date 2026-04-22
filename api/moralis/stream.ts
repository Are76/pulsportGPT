export const config = {
  api: {
    bodyParser: true,
  },
};

type MoralisStreamRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type MoralisStreamResponse = {
  status: (code: number) => MoralisStreamResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type MoralisStreamBody = {
  chainId?: string;
  tag?: string;
  confirmed?: boolean;
  block?: {
    number?: string | number;
    timestamp?: string | number;
    hash?: string;
  };
  txs?: Array<Record<string, unknown>>;
  erc20Transfers?: Array<Record<string, unknown>>;
  logs?: Array<Record<string, unknown>>;
  txsInternal?: Array<Record<string, unknown>>;
};

function summarizePayload(body: MoralisStreamBody) {
  return {
    tag: body.tag ?? null,
    chainId: body.chainId ?? null,
    confirmed: body.confirmed ?? null,
    blockNumber: body.block?.number ?? null,
    timestamp: body.block?.timestamp ?? null,
    txCount: Array.isArray(body.txs) ? body.txs.length : 0,
    erc20TransferCount: Array.isArray(body.erc20Transfers) ? body.erc20Transfers.length : 0,
    internalTxCount: Array.isArray(body.txsInternal) ? body.txsInternal.length : 0,
    logCount: Array.isArray(body.logs) ? body.logs.length : 0,
  };
}

export default async function handler(req: MoralisStreamRequest, res: MoralisStreamResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      endpoint: '/api/moralis/stream',
      usage: 'POST Moralis Streams webhooks here.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const rawBody = req.body;
    const body =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as MoralisStreamBody)
        : {};

    const summary = summarizePayload(body);

    console.log('[moralis-stream] webhook received', {
      headers: req.headers ?? {},
      bodyType: typeof rawBody,
      summary,
    });

    return res.status(200).json({
      ok: true,
      received: summary,
    });
  } catch (error) {
    console.error('[moralis-stream] webhook error', error);

    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown webhook error',
    });
  }
}
