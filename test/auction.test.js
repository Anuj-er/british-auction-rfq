const test = require('node:test');
const assert = require('node:assert');
const {
  MINUTE,
  rankSuppliers,
  checkExtension,
  getStatus,
  validateRfq,
  validateBid,
} = require('../src/auction');

const T = 1_000 * MINUTE;

function makeRfq(triggerType) {
  return {
    bid_start: T - 60 * MINUTE,
    bid_close: T,
    current_close: T,
    forced_close: T + 12 * MINUTE,
    trigger_window_min: 10,
    extension_min: 5,
    trigger_type: triggerType,
  };
}

function bid(name, price, time) {
  return {
    carrier_name: name,
    total_price: price,
    created_at: time,
  };
}

// --- ranking ---

test('ranking: best bid per supplier, ties go to earlier bid', () => {
  const bids = [
    bid('A', 100, 1),
    bid('B', 90, 2),
    bid('A', 80, 3),
    bid('C', 90, 4),
  ];
  const result = rankSuppliers(bids);
  const labels = result.map(b => b.rank + ':' + b.carrier_name);
  assert.deepStrictEqual(labels, ['L1:A', 'L2:B', 'L3:C']);
});

// --- extensions ---

test('ANY_BID inside window extends', () => {
  const before = [bid('A', 100, 1)];
  const after = [...before, bid('B', 120, 2)];
  const ext = checkExtension(
    makeRfq('ANY_BID'),
    before,
    after,
    T - 5 * MINUTE
  );
  assert.strictEqual(ext.newClose, T + 5 * MINUTE);
});

test('ANY_BID outside window — no extension', () => {
  const result = checkExtension(
    makeRfq('ANY_BID'),
    [],
    [bid('A', 100, 1)],
    T - 11 * MINUTE
  );
  assert.strictEqual(result, null);
});

test('extension capped at forced close', () => {
  const rfq = {
    ...makeRfq('ANY_BID'),
    current_close: T + 10 * MINUTE,
  };
  const ext = checkExtension(rfq, [], [bid('A', 100, 1)], T + 9 * MINUTE);
  assert.strictEqual(ext.newClose, rfq.forced_close);
});

test('no extension if already at forced close', () => {
  const rfq = {
    ...makeRfq('ANY_BID'),
    current_close: T + 12 * MINUTE,
  };
  const result = checkExtension(rfq, [], [bid('A', 100, 1)], T + 11 * MINUTE);
  assert.strictEqual(result, null);
});

test('ANY_RANK_CHANGE: newcomer at the bottom doesn\'t extend', () => {
  const before = [bid('A', 100, 1)];
  const after = [...before, bid('B', 150, 2)];
  const result = checkExtension(
    makeRfq('ANY_RANK_CHANGE'),
    before,
    after,
    T - MINUTE
  );
  assert.strictEqual(result, null);
});

test('ANY_RANK_CHANGE: L2 overtakes L1 — extends', () => {
  const before = [bid('A', 100, 1), bid('B', 120, 2)];
  const after = [...before, bid('B', 90, 3)];
  const ext = checkExtension(
    makeRfq('ANY_RANK_CHANGE'),
    before,
    after,
    T - MINUTE
  );
  assert.ok(ext);
});

test('L1_CHANGE: L3 beats L2 but not L1 — no extension. beating L1 — extends', () => {
  const before = [
    bid('A', 100, 1),
    bid('B', 120, 2),
    bid('C', 130, 3),
  ];

  // C beats B but not A
  const after1 = [...before, bid('C', 110, 4)];
  const result1 = checkExtension(
    makeRfq('L1_CHANGE'),
    before,
    after1,
    T - MINUTE
  );
  assert.strictEqual(result1, null);

  // C beats A
  const after2 = [...before, bid('C', 95, 4)];
  const result2 = checkExtension(
    makeRfq('L1_CHANGE'),
    before,
    after2,
    T - MINUTE
  );
  assert.ok(result2);
});

// --- status ---

test('status derived from timestamps', () => {
  const rfq = makeRfq('ANY_BID');
  assert.strictEqual(getStatus(rfq, T - 61 * MINUTE), 'Upcoming');
  assert.strictEqual(getStatus(rfq, T - MINUTE), 'Active');
  assert.strictEqual(getStatus(rfq, T), 'Closed');

  const forcedRfq = { ...rfq, current_close: rfq.forced_close };
  assert.strictEqual(getStatus(forcedRfq, rfq.forced_close), 'Force Closed');
});

// --- validations ---

test('validation: forced close must be after bid close', () => {
  const rfq = {
    name: 'x',
    reference_id: 'x',
    pickup_date: '2026-01-01',
    ...makeRfq('ANY_BID'),
    forced_close: T,
  };
  assert.throws(() => validateRfq(rfq), /Forced close/);
});

test('validation: bid rejects negative charges or invalid transit days', () => {
  assert.throws(() => validateBid({
    carrier_name: 'FastCargo',
    freight_charges: -500,
    origin_charges: 0,
    destination_charges: 0,
    transit_time_days: 2,
    quote_validity: '2026-12-31',
  }), /must be a number >= 0/);

  assert.throws(() => validateBid({
    carrier_name: 'FastCargo',
    freight_charges: 500,
    origin_charges: 0,
    destination_charges: 0,
    transit_time_days: 2.5,
    quote_validity: '2026-12-31',
  }), /Transit time must be a whole number of days/);
});
