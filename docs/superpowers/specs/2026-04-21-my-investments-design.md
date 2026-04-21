# My Investments Design

Date: 2026-04-21
Project: Pulseport Community
Page: `My Investments`

## Goal

Build `My Investments` as the clearest page in the product for answering three questions:

1. How much fiat value did I actually put in?
2. What is that capital worth now across my current PulseChain holdings?
3. Which current assets did that original capital become after bridging and swapping?

This page should follow the UX clarity of GoPulse and the ease-of-use of Zerion, while keeping deeper transaction intelligence available without making the page feel like a tax tool or raw ledger.

## Scope

This spec only covers the first redesign pass for `My Investments`.

In scope:

- Page-level information hierarchy
- Visual direction for `My Investments`
- Current holdings attribution model
- Interaction model for opening asset detail
- Boundary between `My Investments` and `Transactions`

Out of scope:

- Full dashboard redesign
- Full transaction page redesign
- Full staking page redesign
- Backend implementation details beyond the data assumptions required for the UI

## Core Product Decision

`My Investments` is a capital-attribution page, not a transaction-ledger page.

That means:

- The page opens with `Invested Fiat` as the dominant number
- It summarizes current value and P&L against that fiat baseline
- It shows current holdings first
- It expands into source-capital and route attribution on demand
- It does not try to render every swap as the primary page view

Detailed, swap-by-swap P&L belongs in `Transactions` or in an asset-specific transaction view.

## Data Assumptions

The page assumes the product can already fetch historical transaction data from `Ethereum` and `Base`.

Primary funding sources the user cares about:

- `ETH`
- `USDC`
- `DAI`
- `USDT`

The user's invested-fiat baseline is calculated from historical entry-time pricing, including ETH purchases valued at the price on the day they were bought.

## Asset Identity Rules

Exact assets must remain distinct in the UI and data model.

Required examples:

- `HEX` != `eHEX`
- `DAI` != `pDAI`
- bridged or wrapped variants are not merged by default

Implications:

- separate rows
- separate logos
- separate prices
- separate cost basis attribution
- separate P&L
- separate contract and link metadata

Grouping by family may exist later as an optional analysis mode, but the default presentation is exact-token-first.

## Page Objective

Within 5 seconds, the user should understand:

- total invested fiat
- current total value
- net gain or loss

Within 15 seconds, the user should be able to identify:

- the largest current holdings
- which assets hold the most current value
- which assets absorbed the original capital

Within 30 seconds, the user should be able to open an asset and inspect:

- source capital mix
- source chain
- bridge path
- swap path
- then-vs-now valuation

## Information Hierarchy

The page should read in this order:

1. `Invested Fiat`
2. `Current Value`
3. `Net P&L`
4. `Current Holdings`
5. Expanded attribution details per asset

`Invested Fiat` is the dominant headline. It should be displayed as a single combined number across `Ethereum` and `Base`.

## Layout

### 1. Hero Strip

The hero strip anchors the whole page.

Content:

- `Invested Fiat` as the largest number
- `Current Value`
- `Net P&L`
- `Liquid`
- `Staked`
- one restrained action on the right: `Profit Planner`

Behavior:

- `Invested Fiat` is the primary visual anchor
- `Current Value` and `Net P&L` are secondary but still visible without scrolling
- `Liquid` and `Staked` are compact support metrics, not equal-sized cards

### 2. Holdings Filter Row

Below the hero:

- chain filter pills: `All`, `PulseChain`, `Ethereum`, `Base`
- optional future filters for wallet or source-family

Default:

- `All`

This filter row must stay compact and quiet.

### 3. Current Holdings Table

This is the main working surface of the page.

Default sort:

- `Current Value` descending

Columns:

- `Asset`
- `Current Price`
- `Amount`
- `Current Value`
- `Cost Basis`
- `P&L`
- `% Return`

Supported assets include at minimum the user's known bag:

- `PLS`
- `PLSX`
- `INC`
- `HEX`
- `eHEX`
- `pDAI`
- `PRVX`
- `MOST`

And the page must also support any other current asset in the portfolio.

### 4. Row Expansion

Each current-asset row can expand inline.

Expanded content:

- source capital mix from `ETH`, `USDC`, `DAI`, `USDT`
- source chain: `Ethereum` or `Base`
- bridge route
- swap route
- `Then`
- `Now`
- optional links to supporting transactions

The expansion should feel like a premium ledger detail panel, not a modal-heavy context switch.

## Asset Click Behavior

When the user opens an asset from `My Investments`, the default behavior should be:

1. open a compact asset detail drawer or inline detail panel
2. provide a clear link into the full asset-specific transaction/P&L view

Do not jump directly into the full transaction page from the table by default. That is too heavy for normal use.

## Boundary With Transactions

This is a key system boundary.

### `My Investments`

Purpose:

- summarize invested fiat
- summarize current value
- attribute source capital into current assets

Primary visual mode:

- summary-first
- holdings-first
- drill-down on demand

### `Transactions`

Purpose:

- full ledger
- filter by asset, chain, wallet, action
- asset-specific P&L header
- swap-by-swap `then / now`
- realized vs holdings split
- gas and route detail

Examples:

- `HEX Profit & Loss`
- filtered swap history
- realized proceeds vs cost
- holdings summary for one asset

`My Investments` must stay cleaner than `Transactions`.

## Visual Direction

This page should be the cleanest expression of the new Pulseport direction.

Desired feel:

- clear like GoPulse
- polished like Zerion
- more useful than both for PulseChain-native users

Visual rules:

- dark graphite base
- subtle green-teal atmosphere in the hero
- low-chrome panels
- thin borders only
- fewer cards than the current app
- premium table/list emphasis
- no oversized dashboard-box grid

Typography:

- large display numerals for the hero
- compact labels
- strong tabular alignment for values

Color behavior:

- `Invested Fiat`: mint-green emphasis
- gains: mint-green
- losses: coral-red
- neutral values: cool gray-white
- token colors belong to logos and tiny accents, not full-surface UI chrome

## Interaction Design

The page should feel calm and immediate.

Required interaction traits:

- no navigation jumps for normal row inspection
- row expansion instead of full page switches
- one obvious planner action
- quick scan of major positions
- deeper route detail only when opened

Motion should be minimal:

- subtle row expansion
- soft highlight for hovered rows
- restrained numeric emphasis in the hero

## Success Criteria

This design is successful if:

- the first screen feels lighter and cleaner than the current app
- `Invested Fiat` is immediately understandable
- current holdings are easy to scan
- exact-token identity is preserved
- the page does not feel like a cluttered analytics board
- transaction intelligence is reachable without dominating the page

## First Implementation Pass

The first implementation pass should do only this page well.

Recommended implementation order:

1. rebuild the hero strip around `Invested Fiat`
2. rebuild the holdings table with current-value-first sorting
3. add inline asset expansion
4. add the compact link path into transaction-level asset P&L

Do not redesign the entire app shell in the same pass.

The purpose of this page is to establish the lighter product language for the rest of the app.
