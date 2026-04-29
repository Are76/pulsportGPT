# PulsePort Portfolio Tracker

PulsePort is a multi-chain portfolio dashboard for PulseChain, Ethereum, and Base.

## What users can do

- Track balances for multiple wallets in one view.
- Monitor 24h P&L and portfolio allocation.
- Review bridge / wallet activity history.
- Analyze HEX staking and DeFi positions.
- Hide dust and spam tokens for cleaner holdings.

## Quick start (local)

```bash
npm install
npm run dev
```

App runs on **http://localhost:5174** by default.

## Build for production

```bash
npm run build
npm run preview
```

## Desktop (Electron) builds

- `npm run electron:build` (Windows installer + portable + zip)
- `npm run electron:build:mac`
- `npm run electron:build:linux`

## Environment notes

Create a local env file before running:

```bash
cp .env.example .env
```

Then set any optional keys you want to enable (for example explorer API integrations).

## Moralis webhook endpoint

This repo now exposes a Vercel-compatible webhook endpoint for Moralis Streams:

- `/api/moralis/stream`

Use it for live wallet activity from Ethereum and Base once the app is deployed.

Setup notes:

- [docs/moralis-stream-setup.md](C:\Users\areje\OneDrive\Dokumenter\GitHub\pulseport-community\docs\moralis-stream-setup.md)

## User-facing privacy model

- Wallets are **read-only** addresses.
- No private keys are requested or stored.
- App state is saved in browser localStorage for faster reloads.
