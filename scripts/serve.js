const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'};

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);res.end();return;}
    let pathname, url;
    try {url = new URL(req.url, 'http://localhost');pathname = decodeURIComponent(url.pathname);}
    catch (_) {res.writeHead(400);res.end();return;}
    // Keep the document and its relative CSS, scripts and assets in the same directory.
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(302, {'Location':'/paper-comics/index.html' + url.search, 'Cache-Control':'no-cache'});
      res.end();return;
    }
    const file = path.resolve(root, '.' + (pathname === '/paper-comics/' ? '/paper-comics/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
    fs.readFile(file, (error, data) => {
      if (error) {res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  const server = createServer();
  server.on('error', error => {console.error(error.message);process.exitCode=1;});
  server.listen(port, '0.0.0.0', () => console.log(`Paper comics: http://127.0.0.1:${port}/ and http://192.168.0.102:${port}/`));
}
module.exports = {createServer};
