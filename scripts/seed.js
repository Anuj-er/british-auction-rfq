// creates a demo auction that closes in ~3 min
// run while server is stopped, then start it

const service = require('../src/service');

const MIN = 60 * 1000;
const now = Date.now();

const id = service.createRfq({
  name: 'Demo: Mumbai to Delhi FTL',
  reference_id: 'RFQ-DEMO-' + now,
  bid_start: now - MIN,
  bid_close: now + 3 * MIN,
  forced_close: now + 8 * MIN,
  pickup_date: new Date(now + 7 * 24 * 60 * MIN).toISOString().slice(0, 10),
  trigger_window_min: 2,
  extension_min: 1,
  trigger_type: 'ANY_RANK_CHANGE',
});

const validity = new Date(now + 30 * 24 * 60 * MIN).toISOString().slice(0, 10);

// seed a couple bids
service.placeBid(id, {
  carrier_name: 'BlueDart',
  freight_charges: 50000,
  origin_charges: 2000,
  destination_charges: 1500,
  transit_time_days: 3,
  quote_validity: validity,
});
service.placeBid(id, {
  carrier_name: 'Delhivery',
  freight_charges: 48000,
  origin_charges: 2500,
  destination_charges: 1500,
  transit_time_days: 4,
  quote_validity: validity,
});

console.log('Demo RFQ #' + id + ' created. Open http://localhost:3000/rfq.html?id=' + id);
