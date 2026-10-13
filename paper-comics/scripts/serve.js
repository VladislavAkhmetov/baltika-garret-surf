const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'};

function createServer() {
  require('../../scripts/build-game.cjs').buildGame();
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);res.end();return;}
    let pathname;
    try {pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);}
    catch (_) {res.writeHead(400);res.end();return;}
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
    fs.readFile(file, (error, data) => {
      if (error) {res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 8081);
  const server = createServer();
  server.on('error', error => {console.error(error.message);process.exitCode=1;});
  server.listen(port, '127.0.0.1', () => console.log(`Paper comics: http://127.0.0.1:${port}/`));
}
module.exports = {createServer};
