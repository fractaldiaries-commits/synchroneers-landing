/**
 * Receives the OG image from tools/og.html and writes landing/assets/og.jpg.
 *
 *   node landing/tools/write-og.mjs
 *
 * Then open http://localhost:4319/tools/og.html and, from its console:
 *   fetch('http://localhost:4320/og', { method: 'POST', body: window.__ogDataUrl })
 *
 * A one-shot receiver rather than a download, because the image is produced by
 * a canvas in a browser and has to cross back to disk somehow. The server
 * exits as soon as it has the file.
 */

import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'og.jpg');

const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', '*');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(405).end('post the data url');
    return;
  }

  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
  });

  request.on('end', () => {
    const base64 = body.slice(body.indexOf(',') + 1);
    const bytes = Buffer.from(base64, 'base64');
    writeFileSync(out, bytes);
    console.log(`wrote ${out} — ${(bytes.length / 1024).toFixed(0)} KB`);
    response.writeHead(200).end('ok');
    server.close();
    setTimeout(() => process.exit(0), 50);
  });
});

server.listen(4320, () => console.log('waiting for the canvas on :4320'));
setTimeout(() => {
  console.error('timed out waiting for the image');
  process.exit(1);
}, 120000);
