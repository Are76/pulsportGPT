import type { Request, Response, NextFunction } from 'express';

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const VALID_CHAINS = new Set(['pulsechain', 'ethereum', 'base']);

/**
 * Validates that `req.params[paramName]` is a valid EVM address.
 * Normalises to lowercase on success.
 */
export function validateAddress(paramName = 'address') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const addr = req.params[paramName];
    if (!addr || !EVM_ADDRESS_RE.test(addr)) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_ADDRESS',
        message: 'Must be a valid EVM address (0x followed by 40 hex characters)',
      });
      return;
    }
    req.params[paramName] = addr.toLowerCase();
    next();
  };
}

/**
 * Validates that `req.params[paramName]` is one of: pulsechain, ethereum, base.
 */
export function validateChain(paramName = 'chain') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const chain = req.params[paramName];
    if (!chain || !VALID_CHAINS.has(chain)) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_CHAIN',
        message: `Chain must be one of: ${[...VALID_CHAINS].join(', ')}`,
      });
      return;
    }
    next();
  };
}
