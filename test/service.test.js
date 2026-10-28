const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbFile = path.join(
  os.tmpdir(),
  `british-auction-rfq-test-${process.pid}.db`
);
process.env.DB_FILE = dbFile;

const db = require('../src/db');
const service = require('../src/service');
const { ValidationError } = require('../src/auction');

const MINUTE = 60 * 1000;
const NOW = 1_000_000_000;

function rfq(overrides = {}) {
  return {
    name: 'Test RFQ',
    reference_id: `RFQ-${Math.random()}`,
    pickup_date: '2026-11-01',
    bid_start: NOW - MINUTE,
    bid_close: NOW + 10 * MINUTE,
    forced_close: NOW + 20 * MINUTE,
    trigger_window_min: 5,
    extension_min: 3,
    trigger_type: 'ANY_BID',
    ...overrides,
  };
}

function bid(overrides = {}) {
  return {
    carrier_name: 'Carrier A',
    freight_charges: 100,
    origin_charges: 10,
    destination_charges: 5,
    transit_time_days: 2,
    quote_validity: '2026-12-01',
    ...overrides,
  };
}

test.after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbFile + suffix;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
});

test('creates an RFQ and lists its initial status', () => {
  const id = service.createRfq(rfq({ reference_id: 'RFQ-CREATE' }), NOW);
  const result = service.listRfqs(NOW);

  assert.equal(id, 1);
  assert.equal(result[0].reference_id, 'RFQ-CREATE');
  assert.equal(result[0].status, 'Active');
  assert.equal(result[0].lowest_bid, null);
});

test('rejects duplicate RFQ reference IDs', () => {
  assert.throws(
    () => service.createRfq(rfq({ reference_id: 'RFQ-CREATE' }), NOW),
    (error) =>
      error instanceof ValidationError &&
      error.message === 'Reference ID already exists'
  );
});

test('rejects bids before the auction starts and after it closes', () => {
  const upcomingId = service.createRfq(
    rfq({ reference_id: 'RFQ-UPCOMING', bid_start: NOW + MINUTE }),
    NOW
  );
  assert.throws(
    () => service.placeBid(upcomingId, bid(), NOW),
    /Auction has not started yet/
  );

  const closedId = service.createRfq(
    rfq({
      reference_id: 'RFQ-CLOSED',
      bid_start: NOW - 2 * MINUTE,
      bid_close: NOW - MINUTE,
      forced_close: NOW + MINUTE,
    }),
    NOW
  );
  assert.throws(
    () => service.placeBid(closedId, bid(), NOW),
    /Auction is closed/
  );
});

test('caps a bid-triggered extension at forced close', () => {
  const id = service.createRfq(
    rfq({
      reference_id: 'RFQ-CAP',
      bid_close: NOW + MINUTE,
      forced_close: NOW + 2 * MINUTE,
      extension_min: 10,
    }),
    NOW
  );

  const result = service.placeBid(id, bid(), NOW);

  assert.equal(result.extension.newClose, NOW + 2 * MINUTE);
  assert.match(result.extension.reason, /capped at forced close time/);
  assert.equal(
    service.getRfqDetails(id, NOW).rfq.current_close,
    NOW + 2 * MINUTE
  );
});
