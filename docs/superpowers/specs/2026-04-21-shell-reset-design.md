# Pulseport Shell Reset Design

Date: 2026-04-21
Project: Pulseport Community
Status: Approved for planning review

## Goal

Reset the app away from an overbuilt multi-page dashboard and toward a cleaner PulseChain-native product that the community would actually recommend.

The product should feel:
- easier than the current version
- cleaner than PulseChain community dashboards that overload the screen
- more useful than simple price boards
- more complete than GoPulse in the areas users care about most: transactions, cost basis, HEX staking, and personal invested-fiat tracking

## Product Thesis

Pulseport should combine three strengths:
- GoPulse clarity and immediacy
- Zerion ease of use and calm scanability
- plsfolio-style transaction and P&L depth when the user drills in

The app should answer three questions fast:
1. What is PulseChain doing right now?
2. What do I own right now?
3. What did my original fiat become after bridging, swapping, staking, and farming?

## Scope Of This Reset

This reset is focused on shell, information hierarchy, homepage composition, and transaction detail presentation.

This reset does not add new protocols, ecosystem reference pages, or bridge explainer pages.

## Navigation Reset

Remove these pages from primary navigation:
- Bridges
- Ecosystem

Do not lead with bridge information or reference content in the product shell. Those areas add noise and do not help first-use adoption.

Primary navigation becomes:
- Dashboard
- Portfolio
- HEX Staking
- My Investments
- Transactions
- DeFi

Wallet-level controls remain available inside Portfolio and Transactions rather than as a noisy top-level information architecture branch.

## Shell Design

Use a left sidebar again.

Shell rules:
- narrow, quiet left navigation
- slim top utility row only
- no large page hero on normal pages
- content must begin almost immediately below the top utility row
- the first meaningful module should appear in the first viewport

The current top-heavy layout is explicitly rejected.

## Homepage Direction

The homepage is not only a personal tracker. It also acts as a community-facing PulseChain command desk.

That means the first screen must combine:
- a community market layer
- a personal portfolio layer

### First Viewport Layout

Desktop first viewport uses two major columns.

Left column: Capital Stack
- Portfolio Value
- Invested Fiat
- Net P&L
- Liquid
- Staked
- small quick actions such as Profit Planner, Market Watch, Transactions

Right column: PulseBoard
- curated live PulseChain price grid
- occupies roughly half the page width
- fixed curated set rather than only the user's holdings
- always visible on homepage desktop layout

The homepage PulseBoard must feel alive and memorable. It is the network heartbeat surface.

### Homepage Below The Fold

Below the first viewport:
- My Holdings
- Recent Transactions
- HEX Staking preview
- optional Market Pulse or planner prompt

Avoid informational dead sections and avoid giant piles of equal-weight cards.

## PulseBoard

The curated homepage grid should be a permanent dashboard module, not a modal.

Purpose:
- make the homepage useful even before wallet context is fully loaded
- make the product feel like a community dashboard instead of a private spreadsheet
- give people something to recommend and screenshot

Desktop recommendation:
- 2 columns by 4 rows

Default core set should prioritize PulseChain relevance. Personal holdings are shown elsewhere and do not control whether the grid exists.

## Transactions Page Reset

The transactions screen should return to being a real utility surface.

The current issues to fix:
- too much dead space at the top
- weak hierarchy
- list and detail views do not feel integrated
- detail got reduced while chrome increased

### Transactions Rules

- no oversized intro header
- compact filter rail near the top
- transaction rows start immediately
- richer expandable detail comes back
- show asset-specific P&L summary only when the user is filtering to a relevant asset

### Transaction Detail

Expanded detail should support the useful plsfolio-style view:
- swap path
- then vs now
- realized split when relevant
- holdings value now
- gas / fee context
- direct asset filtering

The default rows stay easy to scan. The depth appears only on expansion.

## My Investments Role

My Investments remains the main differentiator of the product.

It must keep these rules:
- dominant top metric is Invested Fiat
- invested fiat is based on historical entry pricing for source inflows
- current holdings remain exact asset identity, not merged token families
- row expansion shows source attribution from ETH, USDC, DAI, USDT and route context

This page should stay cleaner than Transactions.

## Asset Identity Rules

Exact token identity is the default throughout the app.

Required examples:
- HEX is separate from eHEX
- DAI is separate from pDAI
- bridged and wrapped variants are distinct unless grouped in an optional family view

Default UI behavior:
- separate rows
- separate prices
- separate P&L
- separate logos
- separate contracts

## HEX Staking Role

HEX Staking remains a first-class page.

The page should combine:
- liquid HEX
- liquid eHEX
- active stakes
- projected ladder yield
- T-shares
- maturity visibility

It should follow the lighter shell reset and should not look like an isolated special dashboard.

## Visual Direction

Tone:
- calmer
- tighter
- darker premium surface
- less template-like
- more trustworthy

Design rules:
- fewer borders
- less white card chrome
- stronger typography
- compact, obvious controls
- one memorable homepage composition instead of many generic dashboard widgets

References used for the reset:
- GoPulse for immediacy and simple scanability
- Zerion for app ease and layout discipline
- Koinly for result-first hierarchy
- user's earlier portfolio screens for transaction P&L and staking detail
- two provided inspiration images for compositional cues only, not visual copying

## Success Criteria

This redesign is successful when:
- the homepage reads clearly within five seconds
- the app no longer feels top-heavy
- users can recommend it without explaining where to click first
- transactions feel useful again
- ecosystem and bridge reference clutter no longer distracts from core tasks
- the app feels closer to a PulseChain product and less like a generic crypto template

## First Implementation Pass

1. Reset shell to left-sidebar layout with minimal top bar
2. Remove Bridges and Ecosystem from primary nav
3. Rebuild homepage around Capital Stack + PulseBoard
4. Rework Transactions to compact list-first layout with richer expansion
5. Keep My Investments and attribution logic intact, adapting only shell alignment
6. Apply the same calmer system to HEX Staking next
