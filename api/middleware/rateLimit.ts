import type { Request, Response, NextFunction } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const windows = new Map<string, Window>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (ip ?? req.socket.remoteAddress ?? 'unknown').trim();
}

/**
 * Returns middleware that limits each IP to `maxRequests` per 60-second window.
 */
export function rateLimit(maxRequests = 60) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();

    let win = windows.get(ip);
    if (!win || now >= win.resetAt) {
      win = { count: 0, resetAt: now + WINDOW_MS };
      windows.set(ip, win);
    }

    win.count++;
    if (win.count > maxRequests) {
      const retryAfter = Math.ceil((win.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        ok: false,
        error: 'RATE_LIMITED',
        message: `Too many requests. Retry after ${retryAfter}s.`,
      });
      return;
    }

    next();
  };
}
