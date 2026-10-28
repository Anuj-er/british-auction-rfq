# British Auction RFQ

RFQ system with British Auction-style bidding — the auction auto-extends when there's activity near the close time, up to a hard forced-close limit.

No dependencies. Uses Node built-ins only (`http`, `sqlite`, `test`). No `npm install` needed.

## Getting started

You need **Node 22.13+** (that's when `node:sqlite` landed).

```bash
npm start          # starts server at http://localhost:3000
npm run seed       # seeds a demo auction that closes in ~3 min
npm test           # runs the unit tests
```

## What's in here

- `src/server.js` — HTTP routing, JSON parsing, static file serving
- `src/service.js` — business logic layer, DB transactions
- `src/auction.js` — pure auction rules (ranking, extensions, validation). No DB access, easy to test
- `src/db.js` — opens SQLite, runs schema
- `src/schema.sql` — table definitions
- `scripts/seed.js` — creates a demo auction
- `public/scripts/` — browser scripts for the two pages
- `public/` — frontend (two pages, vanilla JS, no build step)
- `test/auction.test.js` — unit tests for the auction rules
- `test/service.test.js` — database-backed service and API workflow tests
- `docs/HLD.md` — architecture diagram, schema, bid flow

## API

```
POST /api/rfqs           create an RFQ
GET  /api/rfqs           list all auctions
GET  /api/rfqs/:id       get auction details (ranking, bids, activity log)
POST /api/rfqs/:id/bids  submit a bid (may trigger extension)
```

All timestamps are epoch milliseconds.

## How the auction works

When a bid comes in within X minutes of closing, and the trigger condition fires, the close time gets pushed forward by Y minutes. But it can never go past `forced_close`.

Three trigger types (each stricter than the last):
- **ANY_BID** — any bid in the window extends
- **ANY_RANK_CHANGE** — extends only if an existing supplier's position changed
- **L1_CHANGE** — extends only if the #1 spot changed

Status is computed from timestamps (no cron needed). The whole bid placement runs inside a SQLite transaction so concurrent bids can't cause issues.
