const db = require('./db');
const {
  ValidationError,
  rankSuppliers,
  checkExtension,
  getStatus,
  validateRfq,
  validateBid,
} = require('./auction');

class NotFoundError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'NotFoundError';
  }
}

function formatTime(ms) {
  return new Date(ms).toLocaleString();
}

function addLog(rfqId, type, msg, timestamp) {
  db.prepare(
    'INSERT INTO activity_log (rfq_id, type, message, created_at) VALUES (?, ?, ?, ?)'
  ).run(rfqId, type, msg, timestamp);
}

function createRfq(input, now = Date.now()) {
  const rfq = {
    name: String(input.name || '').trim(),
    reference_id: String(input.reference_id || '').trim(),
    bid_start: Number(input.bid_start),
    bid_close: Number(input.bid_close),
    forced_close: Number(input.forced_close),
    pickup_date: String(input.pickup_date || ''),
    trigger_window_min: Number(input.trigger_window_min),
    extension_min: Number(input.extension_min),
    trigger_type: input.trigger_type,
  };
  validateRfq(rfq);

  // make sure ref id is unique
  const existing = db.prepare('SELECT 1 FROM rfqs WHERE reference_id = ?').get(rfq.reference_id);
  if (existing) {
    throw new ValidationError('Reference ID already exists');
  }

  const result = db.prepare(`
    INSERT INTO rfqs (name, reference_id, bid_start, bid_close, current_close, forced_close,
                      pickup_date, trigger_window_min, extension_min, trigger_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rfq.name,
    rfq.reference_id,
    rfq.bid_start,
    rfq.bid_close,
    rfq.bid_close,  // current_close starts same as bid_close
    rfq.forced_close,
    rfq.pickup_date,
    rfq.trigger_window_min,
    rfq.extension_min,
    rfq.trigger_type,
    now
  );

  const id = Number(result.lastInsertRowid);
  addLog(
    id,
    'RFQ_CREATED',
    'RFQ created. Closes ' + formatTime(rfq.bid_close) + ', forced close ' + formatTime(rfq.forced_close),
    now
  );
  return id;
}

function listRfqs(now = Date.now()) {
  const rows = db.prepare(`
    SELECT r.*, (SELECT MIN(total_price) FROM bids b WHERE b.rfq_id = r.id) AS lowest_bid
    FROM rfqs r ORDER BY r.created_at DESC
  `).all();

  return rows.map(function (r) {
    return { ...r, status: getStatus(r, now) };
  });
}

function getRfqDetails(id, now = Date.now()) {
  const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(id);
  if (!rfq) {
    throw new NotFoundError('RFQ not found');
  }

  const bids = db.prepare('SELECT * FROM bids WHERE rfq_id = ?').all(id);
  const logs = db.prepare(
    'SELECT * FROM activity_log WHERE rfq_id = ? ORDER BY created_at DESC, id DESC'
  ).all(id);

  const sortedBids = [...bids].sort((a, b) => {
    return a.total_price - b.total_price;
  });

  return {
    rfq: { ...rfq, status: getStatus(rfq, now) },
    ranking: rankSuppliers(bids),
    bids: sortedBids,
    activity: logs,
    server_time: now,
  };
}

/*
 * Whole thing runs in a single transaction so two concurrent
 * bids can't both read the same state and double-extend.
 */
function placeBid(rfqId, input, now = Date.now()) {
  const bid = {
    carrier_name: String(input.carrier_name || '').trim(),
    freight_charges: Number(input.freight_charges),
    origin_charges: Number(input.origin_charges),
    destination_charges: Number(input.destination_charges),
    transit_time_days: Number(input.transit_time_days),
    quote_validity: String(input.quote_validity || ''),
  };
  validateBid(bid);
  bid.total_price = bid.freight_charges + bid.origin_charges + bid.destination_charges;

  db.exec('BEGIN IMMEDIATE');
  try {
    const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(rfqId);
    if (!rfq) {
      throw new NotFoundError('RFQ not found');
    }
    if (now < rfq.bid_start) {
      throw new ValidationError('Auction has not started yet');
    }
    if (now >= rfq.current_close) {
      throw new ValidationError('Auction is closed');
    }

    // make sure they're improving on their own best
    const existingBids = db.prepare('SELECT * FROM bids WHERE rfq_id = ?').all(rfqId);
    const myPrev = rankSuppliers(existingBids).find(function (b) {
      return b.carrier_name === bid.carrier_name;
    });
    if (myPrev && bid.total_price >= myPrev.total_price) {
      throw new ValidationError(
        'New bid must be lower than your previous best (' + myPrev.total_price + ')'
      );
    }

    const result = db.prepare(`
      INSERT INTO bids (rfq_id, carrier_name, freight_charges, origin_charges,
                        destination_charges, total_price, transit_time_days,
                        quote_validity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rfqId,
      bid.carrier_name,
      bid.freight_charges,
      bid.origin_charges,
      bid.destination_charges,
      bid.total_price,
      bid.transit_time_days,
      bid.quote_validity,
      now
    );

    addLog(rfqId, 'BID', bid.carrier_name + ' bid ' + bid.total_price, now);

    const savedBid = {
      ...bid,
      id: Number(result.lastInsertRowid),
      rfq_id: rfqId,
      created_at: now,
    };

    // check if we need to extend the auction
    const allBids = [...existingBids, savedBid];
    const ext = checkExtension(rfq, existingBids, allBids, now);
    if (ext) {
      db.prepare('UPDATE rfqs SET current_close = ? WHERE id = ?')
        .run(ext.newClose, rfqId);
      addLog(
        rfqId,
        'EXTENSION',
        'Extended ' + formatTime(rfq.current_close) + ' -> ' + formatTime(ext.newClose) + '. Reason: ' + ext.reason,
        now
      );
    }

    db.exec('COMMIT');
    return { bid: savedBid, extension: ext };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  NotFoundError,
  createRfq,
  listRfqs,
  getRfqDetails,
  placeBid,
};
