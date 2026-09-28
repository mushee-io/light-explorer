const http = require('http');
const fs = require('fs');
const path = require('path');
const ultraHandler = require('./api/ultra');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/ultra')) return ultraHandler(req, res);

  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, requested.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Ultra Lite Explorer running at http://localhost:${PORT}`));
