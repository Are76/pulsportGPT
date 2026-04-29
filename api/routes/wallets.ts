import { Router } from 'express';
import { validateAddress } from '../middleware/validate';
import { upsertWallet, deleteWallet, listWallets } from '../db/queries';

const router = Router();

// POST /api/v1/wallets  { address, label? }
router.post('/', (req, res) => {
  const { address, label } = req.body as { address?: unknown; label?: unknown };

  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({
      ok: false,
      error: 'INVALID_ADDRESS',
      message: 'address must be a valid EVM address (0x + 40 hex chars)',
    });
    return;
  }

  const normalizedAddress = address.toLowerCase();
  const normalizedLabel = typeof label === 'string' && label.trim().length > 0 ? label.trim() : undefined;

  try {
    upsertWallet(normalizedAddress, normalizedLabel);
    res.status(201).json({ ok: true, data: { address: normalizedAddress, label: normalizedLabel ?? null } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'DB_ERROR',
      message: err instanceof Error ? err.message : 'Failed to save wallet',
    });
  }
});

// GET /api/v1/wallets
router.get('/', (_req, res) => {
  try {
    const wallets = listWallets();
    res.json({ ok: true, data: wallets });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'DB_ERROR',
      message: err instanceof Error ? err.message : 'Failed to list wallets',
    });
  }
});

// DELETE /api/v1/wallets/:address
router.delete('/:address', validateAddress(), (req, res) => {
  const { address } = req.params;
  try {
    const deleted = deleteWallet(address);
    if (!deleted) {
      res.status(404).json({ ok: false, error: 'NOT_FOUND', message: 'Wallet not found' });
      return;
    }
    res.json({ ok: true, data: { address } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'DB_ERROR',
      message: err instanceof Error ? err.message : 'Failed to delete wallet',
    });
  }
});

export default router;
