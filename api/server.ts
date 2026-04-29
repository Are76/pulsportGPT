import express from 'express';
import { rateLimit } from './middleware/rateLimit';
import portfolioRouter from './routes/portfolio';
import pricesRouter from './routes/prices';
import transactionsRouter from './routes/transactions';
import stakesRouter from './routes/stakes';
import lpRouter from './routes/lp';
import walletsRouter from './routes/wallets';
import moralisHandler from './moralis/stream';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Disable fingerprinting
app.disable('x-powered-by');

// Health check (no rate-limit)
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pulseport-api', ts: Date.now() });
});

// Apply per-IP rate limiting to all API routes
app.use('/api', rateLimit(60));

// --- API v1 routes ---
app.use('/api/v1/portfolio', portfolioRouter);
app.use('/api/v1/prices', pricesRouter);
app.use('/api/v1/txns', transactionsRouter);
app.use('/api/v1/stakes', stakesRouter);
app.use('/api/v1/lp', lpRouter);
app.use('/api/v1/wallets', walletsRouter);

// Moralis webhook (compatible shim for the existing Next-style handler)
app.all('/api/moralis/stream', (req, res) => {
  // MoralisStreamResponse is a custom type in stream.ts; cast via unknown to bridge Express types
  const shim = {
    status: (code: number) => { res.status(code); return shim; },
    json: (payload: unknown) => { res.json(payload); },
    setHeader: (name: string, value: string) => { res.setHeader(name, value); },
  } as unknown as Parameters<typeof moralisHandler>[1];

  moralisHandler(
    { method: req.method, body: req.body, headers: req.headers as Record<string, string> },
    shim,
  );
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Route not found' });
});

// Global error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error', err);
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
});

app.listen(PORT, () => {
  console.log(`[pulseport-api] listening on http://localhost:${PORT}`);
});

export default app;
