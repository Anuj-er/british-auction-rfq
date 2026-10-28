const MINUTE = 60 * 1000;

const TRIGGER_TYPES = {
  ANY_BID: 'Bid received in last X minutes',
  ANY_RANK_CHANGE: 'Any supplier rank change in last X minutes',
  L1_CHANGE: 'Lowest bidder (L1) change in last X minutes',
};

class ValidationError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'ValidationError';
  }
}

// finds each supplier's lowest bid and sorts them
function rankSuppliers(bids) {
  const bestBids = new Map();

  for (const b of bids) {
    const prev = bestBids.get(b.carrier_name);
    if (!prev || b.total_price < prev.total_price) {
      bestBids.set(b.carrier_name, b);
    }
  }

  const sorted = [...bestBids.values()].sort((a, b) => {
    return a.total_price - b.total_price || a.created_at - b.created_at;
  });

  return sorted.map((b, i) => {
    return { ...b, rank: 'L' + (i + 1) };
  });
}

function checkExtension(rfq, oldBids, newBids, now) {
  const winStart = rfq.current_close - rfq.trigger_window_min * MINUTE;

  if (now < winStart) {
    return null;
  }

  const oldRanking = rankSuppliers(oldBids).map(function (b) {
    return b.carrier_name;
  });
  const newRanking = rankSuppliers(newBids).map(function (b) {
    return b.carrier_name;
  });

  let reason = null;

  if (rfq.trigger_type === 'ANY_BID') {
    reason = `Bid received within last ${rfq.trigger_window_min} min`;

  } else if (rfq.trigger_type === 'ANY_RANK_CHANGE') {
    // new supplier at the bottom doesn't count since nobody moved
    const changed = oldRanking.some((name, i) => {
      return newRanking[i] !== name;
    });
    if (changed) {
      reason = `Supplier ranking changed within last ${rfq.trigger_window_min} min`;
    }

  } else if (rfq.trigger_type === 'L1_CHANGE') {
    if (oldRanking.length > 0 && newRanking[0] !== oldRanking[0]) {
      reason = `${newRanking[0]} became the new L1 within last ${rfq.trigger_window_min} min`;
    }
  }

  if (!reason) {
    return null;
  }

  // never go past forced close
  const newClose = Math.min(
    rfq.current_close + rfq.extension_min * MINUTE,
    rfq.forced_close
  );

  if (newClose <= rfq.current_close) {
    return null;
  }
  if (newClose === rfq.forced_close) {
    reason += ' (capped at forced close time)';
  }

  return { newClose, reason };
}

function getStatus(rfq, now) {
  if (now < rfq.bid_start) {
    return 'Upcoming';
  }
  if (now < rfq.current_close) {
    return 'Active';
  }
  if (rfq.current_close >= rfq.forced_close) {
    return 'Force Closed';
  }
  return 'Closed';
}

function validateRfq(data) {
  if (!data.name) {
    throw new ValidationError('RFQ name is required');
  }
  if (!data.reference_id) {
    throw new ValidationError('Reference ID is required');
  }
  if (!data.pickup_date) {
    throw new ValidationError('Pickup / service date is required');
  }

  const timeFields = ['bid_start', 'bid_close', 'forced_close'];
  for (let i = 0; i < timeFields.length; i++) {
    if (!Number.isFinite(data[timeFields[i]])) {
      throw new ValidationError(timeFields[i] + ' must be a valid date');
    }
  }

  if (data.bid_close <= data.bid_start) {
    throw new ValidationError('Bid close time must be after bid start time');
  }
  if (data.forced_close <= data.bid_close) {
    throw new ValidationError('Forced close time must be later than bid close time');
  }
  if (!(data.trigger_window_min > 0)) {
    throw new ValidationError('Trigger window (X) must be greater than 0');
  }
  if (!(data.extension_min > 0)) {
    throw new ValidationError('Extension duration (Y) must be greater than 0');
  }
  if (!TRIGGER_TYPES[data.trigger_type]) {
    throw new ValidationError('Invalid trigger type');
  }
}

function validateBid(data) {
  if (!data.carrier_name) {
    throw new ValidationError('Carrier name is required');
  }

  const chargeFields = ['freight_charges', 'origin_charges', 'destination_charges'];
  for (let i = 0; i < chargeFields.length; i++) {
    const val = data[chargeFields[i]];
    if (!Number.isFinite(val) || val < 0) {
      throw new ValidationError(chargeFields[i] + ' must be a number >= 0');
    }
  }

  if (!Number.isInteger(data.transit_time_days) || data.transit_time_days < 0) {
    throw new ValidationError('Transit time must be a whole number of days');
  }
  if (!data.quote_validity) {
    throw new ValidationError('Quote validity is required');
  }
}

module.exports = {
  MINUTE,
  TRIGGER_TYPES,
  ValidationError,
  rankSuppliers,
  checkExtension,
  getStatus,
  validateRfq,
  validateBid,
};
