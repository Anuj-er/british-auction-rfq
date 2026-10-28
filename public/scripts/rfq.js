const rfqId = new URLSearchParams(location.search).get('id');
const TRIGGERS = {
  ANY_BID: 'Bid received in last X min',
  ANY_RANK_CHANGE: 'Any rank change in last X min',
  L1_CHANGE: 'L1 change in last X min',
};
let data = null;
let offset = 0;

function fmt(ms) {
  return new Date(ms).toLocaleString();
}

async function load() {
  const res = await fetch('/api/rfqs/' + rfqId);
  data = await res.json();

  if (!res.ok) {
    document.body.innerHTML =
      '<div style="padding:24px; color:#dc2626;">' +
      (data.error || 'Failed to load RFQ') +
      '</div>';
    return;
  }

  const r = data.rfq;
  document.getElementById('title').textContent =
    r.name + ' (' + r.reference_id + ')';
  document.getElementById('config').innerHTML =
    '<b>Trigger window (X):</b> ' + r.trigger_window_min + ' min &bull; ' +
    '<b>Extension (Y):</b> ' + r.extension_min + ' min &bull; ' +
    '<b>Trigger rule:</b> ' + (TRIGGERS[r.trigger_type] || r.trigger_type) + ' &bull; ' +
    '<b>Pickup date:</b> ' + r.pickup_date;

  let rankingHtml = '';
  for (let i = 0; i < data.ranking.length; i++) {
    const b = data.ranking[i];
    rankingHtml += '<tr>';
    rankingHtml += '<td><b>' + b.rank + '</b></td>';
    rankingHtml += '<td>' + b.carrier_name + '</td>';
    rankingHtml += '<td>' + b.freight_charges + '</td>';
    rankingHtml += '<td>' + b.origin_charges + '</td>';
    rankingHtml += '<td>' + b.destination_charges + '</td>';
    rankingHtml += '<td><b>' + b.total_price + '</b></td>';
    rankingHtml += '<td>' + b.transit_time_days + ' d</td>';
    rankingHtml += '<td>' + b.quote_validity + '</td>';
    rankingHtml += '</tr>';
  }
  document.getElementById('ranking').innerHTML =
    rankingHtml || '<tr><td colspan="8" style="text-align:center; color:#9ca3af; padding:18px;">No bids submitted yet</td></tr>';

  let bidsHtml = '';
  for (let j = 0; j < data.bids.length; j++) {
    const item = data.bids[j];
    bidsHtml += '<tr>';
    bidsHtml += '<td>' + item.carrier_name + '</td>';
    bidsHtml += '<td><b>' + item.total_price + '</b></td>';
    bidsHtml += '<td>' + fmt(item.created_at) + '</td>';
    bidsHtml += '</tr>';
  }
  document.getElementById('bids').innerHTML =
    bidsHtml || '<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:18px;">No bid history yet</td></tr>';

  let activityHtml = '';
  for (let k = 0; k < data.activity.length; k++) {
    const a = data.activity[k];
    activityHtml += '<tr class="' + a.type + '">';
    activityHtml += '<td>' + fmt(a.created_at) + '</td>';
    activityHtml += '<td>' + a.type + '</td>';
    activityHtml += '<td>' + a.message + '</td>';
    activityHtml += '</tr>';
  }
  document.getElementById('activity').innerHTML =
    activityHtml || '<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:18px;">No activity logged</td></tr>';

  const isActive = r.status === 'Active';
  document.getElementById('bid').style.display = isActive ? '' : 'none';
  document.getElementById('bid-heading').style.display = isActive ? '' : 'none';
  tick();
}

function tick() {
  if (!data) return;

  const r = data.rfq;
  const left = Math.max(0, r.current_close - (Date.now() + offset));
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  let html = '<span class="badge ' + r.status.split(' ')[0] + '">' + r.status + '</span>';
  html += '<span>Closing: <b>' + fmt(r.current_close) + '</b></span>';
  if (r.status === 'Active') {
    html += '<span class="countdown">' + mins + 'm ' + secs + 's remaining</span>';
  }
  html += '<span style="color:#6b7280; font-size:0.85rem;">(Original: ' +
    fmt(r.bid_close) + ' &bull; Cap: ' + fmt(r.forced_close) + ')</span>';
  document.getElementById('summary').innerHTML = html;
}

document.getElementById('bid').onsubmit = async function (e) {
  e.preventDefault();
  const formData = Object.fromEntries(new FormData(e.target));
  const res = await fetch('/api/rfqs/' + rfqId + '/bids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  const body = await res.json();

  if (res.ok) {
    document.getElementById('error').textContent = '';
    e.target.reset();
    load();
  } else {
    document.getElementById('error').textContent = body.error;
  }
};

load().then(function () {
  offset = data.server_time - Date.now();
});
setInterval(load, 3000);
setInterval(tick, 1000);
