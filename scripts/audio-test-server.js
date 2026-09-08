// Local-only browser regression fixture; deliberately separate from production routes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path === '/' ? '/tests/audio-browser.html' : path;
  if (file.includes('..') || !/^\/(client|shared|tests)\/[a-zA-Z0-9_./-]+$/.test(file)) {
    res.writeHead(404).end(); return;
  }
  try {
    const data = await readFile(resolve(root, '.' + file));
    const type = {'.html':'text/html','.js':'text/javascript','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'}[extname(file)];
    res.writeHead(200, {'Content-Type':type || 'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(5101, '127.0.0.1', () => console.log('Audio regression fixture: http://127.0.0.1:5101'));
