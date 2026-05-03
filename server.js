// Minimal static file server for Railway/Render/Fly.io
// Serves everything from current directory.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Strip query, decode
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (_) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // Resolve and protect against path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (statErr, stats) => {
    let target = filePath;
    if (statErr || !stats || stats.isDirectory()) {
      // try .html suffix or fall back to index.html (SPA)
      if (!statErr && stats && stats.isDirectory()) {
        target = path.join(filePath, 'index.html');
      } else {
        // SPA fallback to index.html for unknown routes (no file ext)
        if (!path.extname(filePath)) {
          target = path.join(ROOT, 'index.html');
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
      }
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log('GreenLine preview listening on port ' + PORT);
});
