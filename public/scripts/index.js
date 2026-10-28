function fmt(ms) {
  return new Date(ms).toLocaleString();
}

function badge(status) {
  const cls = status.split(' ')[0];
  return '<span class="badge ' + cls + '">' + status + '</span>';
}

async function loadList() {
  const response = await fetch('/api/rfqs');
  const rfqs = await response.json();

  if (!rfqs || rfqs.length === 0) {
    document.getElementById('list').innerHTML =
      '<tr><td colspan="5" style="text-align:center; color:#9ca3af; padding: 24px;">No auctions created yet</td></tr>';
    return;
  }

  let html = '';
  for (let i = 0; i < rfqs.length; i++) {
    const r = rfqs[i];
    html += '<tr>';
    html += '<td><a href="rfq.html?id=' + r.id + '">' + r.name + '</a>';
    html += '<br><small>' + r.reference_id + '</small></td>';
    html += '<td><b>' + (r.lowest_bid != null ? r.lowest_bid : '-') + '</b></td>';
    html += '<td>' + fmt(r.current_close) + '</td>';
    html += '<td>' + fmt(r.forced_close) + '</td>';
    html += '<td>' + badge(r.status) + '</td>';
    html += '</tr>';
  }
  document.getElementById('list').innerHTML = html;
}

document.getElementById('create').onsubmit = async function (e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));

  data.bid_start = new Date(data.bid_start).getTime();
  data.bid_close = new Date(data.bid_close).getTime();
  data.forced_close = new Date(data.forced_close).getTime();

  const res = await fetch('/api/rfqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();

  if (!res.ok) {
    document.getElementById('error').textContent = body.error;
    return;
  }
  location.href = 'rfq.html?id=' + body.id;
};

loadList();
setInterval(loadList, 5000);
