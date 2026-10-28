const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ValidationError } = require('./auction');
const service = require('./service');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, '..', 'public');
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', function (chunk) {
      chunks += chunk;
    });
    req.on('end', () => {
      try {
        resolve(chunks ? JSON.parse(chunks) : {});
      } catch {
        reject(new ValidationError('Invalid JSON body'));
      }
    });
  });
}

function serveFile(req, res) {
  const urlPath = req.url.split('?')[0];
  const fileName = urlPath === '/' ? 'index.html' : urlPath;
  const filePath = path.join(STATIC_DIR, fileName);

  // don't let anyone read files outside public/
  if (!filePath.startsWith(STATIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'text/plain' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  // e.g. ['api', 'rfqs'] or ['api', 'rfqs', '3', 'bids']

  if (req.method === 'POST' && segments.length === 2) {
    const body = await parseBody(req);
    const id = service.createRfq(body);
    return jsonResponse(res, 201, { id });
  }

  if (req.method === 'GET' && segments.length === 2) {
    return jsonResponse(res, 200, service.listRfqs());
  }

  if (req.method === 'GET' && segments.length === 3) {
    const rfqId = Number(segments[2]);
    return jsonResponse(res, 200, service.getRfqDetails(rfqId));
  }

  if (req.method === 'POST' && segments.length === 4 && segments[3] === 'bids') {
    const rfqId = Number(segments[2]);
    const body = await parseBody(req);
    return jsonResponse(res, 201, service.placeBid(rfqId, body));
  }

  jsonResponse(res, 404, { error: 'Route not found' });
}

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/api/rfqs')) {
    return serveFile(req, res);
  }

  try {
    await handleApi(req, res);
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse(res, 400, { error: err.message });
    }
    if (err.name === 'NotFoundError') {
      return jsonResponse(res, 404, { error: err.message });
    }
    console.error(err);
    jsonResponse(res, 500, { error: 'Something went wrong' });
  }
});

server.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
