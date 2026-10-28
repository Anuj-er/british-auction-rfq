-- times stored as unix epoch ms (matches JS Date.now())
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rfqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  reference_id TEXT NOT NULL UNIQUE,
  bid_start INTEGER NOT NULL,
  bid_close INTEGER NOT NULL,          -- original close (never changes)
  current_close INTEGER NOT NULL,      -- moves forward on extensions
  forced_close INTEGER NOT NULL,       -- hard cap
  pickup_date TEXT NOT NULL,
  trigger_window_min INTEGER NOT NULL, -- X
  extension_min INTEGER NOT NULL,      -- Y
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('ANY_BID','ANY_RANK_CHANGE','L1_CHANGE')),
  created_at INTEGER NOT NULL,
  CHECK (forced_close > bid_close),
  CHECK (bid_close > bid_start)
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  carrier_name TEXT NOT NULL,
  freight_charges REAL NOT NULL,
  origin_charges REAL NOT NULL,
  destination_charges REAL NOT NULL,
  total_price REAL NOT NULL, -- sum of the three, stored for sorting
  transit_time_days INTEGER NOT NULL,
  quote_validity TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bids_rfq ON bids(rfq_id, total_price);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  type TEXT NOT NULL CHECK (type IN ('RFQ_CREATED','BID','EXTENSION')),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_rfq ON activity_log(rfq_id, created_at);
