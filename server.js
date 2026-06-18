/* Servidor do Mapa de Peças de Madeira.
   Serve o app estático (src/) e uma API REST simples para projetos,
   persistidos como arquivos JSON em ./data (volume montado).
   Sem dependências externas — apenas o runtime do Node. */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 80;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'src');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');

fs.mkdirSync(DATA, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = s => UUID_RE.test(s);
const projFile = id => path.join(DATA, id + '.json');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}
function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024 * 1024) throw new Error('payload muito grande');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  } catch {
    send(res, 404, 'Não encontrado');
  }
}

async function listProjects() {
  const files = (await fsp.readdir(DATA)).filter(f => f.endsWith('.json'));
  const list = [];
  for (const f of files) {
    try {
      const j = JSON.parse(await fsp.readFile(path.join(DATA, f), 'utf8'));
      list.push({
        id: j.id, name: j.name,
        createdAt: j.createdAt, updatedAt: j.updatedAt,
        pieces: (j.data && j.data.pieces && j.data.pieces.length) || 0,
        hasImage: !!(j.data && j.data.image && j.data.image.dataUrl),
      });
    } catch { /* ignora arquivos inválidos */ }
  }
  list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return list;
}

// Dimensões reais da peça em mm (mesma lógica do editor: medida manual ou
// derivada da calibração px/cm, com arredondamento opcional de 0,5 cm).
function roundCmV(v, snapHalf) { return snapHalf ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10; }
function pieceSizeMm(p, data) {
  const opt = data.options || {};
  let wcm, hcm;
  if (p.manual) { wcm = p.realW; hcm = p.realH; }
  else if (data.scale && data.scale.pxPerCm) {
    wcm = roundCmV(p.w / data.scale.pxPerCm, opt.snapHalf);
    hcm = roundCmV(p.h / data.scale.pxPerCm, opt.snapHalf);
  } else { wcm = null; hcm = null; }
  if (wcm == null || hcm == null) return null;
  return { w: Math.round(wcm * 10), h: Math.round(hcm * 10) };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

    // ----- API: coleção -----
    if (p === '/api/projects') {
      if (req.method === 'GET') return sendJson(res, 200, await listProjects());
      if (req.method === 'POST') {
        let payload = {};
        try { const b = await readBody(req); payload = b ? JSON.parse(b) : {}; } catch {}
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const proj = {
          id, name: (payload.name || 'Novo projeto').toString().slice(0, 200),
          createdAt: now, updatedAt: now, data: payload.data || null,
        };
        await fsp.writeFile(projFile(id), JSON.stringify(proj, null, 2));
        return sendJson(res, 201, proj);
      }
      return sendJson(res, 405, { error: 'método não permitido' });
    }

    // ----- API: peças de um projeto (dimensões em mm, sem a imagem) -----
    const mp = p.match(/^\/api\/projects\/([^/]+)\/pieces$/);
    if (mp) {
      const id = mp[1];
      if (!isUuid(id)) return sendJson(res, 400, { error: 'id inválido' });
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'método não permitido' });
      try {
        const j = JSON.parse(await fsp.readFile(projFile(id), 'utf8'));
        const data = j.data || {};
        const pieces = (data.pieces || []).map(p => {
          const s = pieceSizeMm(p, data);
          return {
            id: p.id, label: p.label, colorName: p.colorName || '', color: p.color || '#888888',
            w: s ? s.w : null, h: s ? s.h : null,
          };
        });
        return sendJson(res, 200, { id: j.id, name: j.name, pieces });
      } catch { return sendJson(res, 404, { error: 'projeto não encontrado' }); }
    }

    // ----- API: item -----
    const m = p.match(/^\/api\/projects\/([^/]+)$/);
    if (m) {
      const id = m[1];
      if (!isUuid(id)) return sendJson(res, 400, { error: 'id inválido' });
      const file = projFile(id);

      if (req.method === 'GET') {
        try { return send(res, 200, await fsp.readFile(file), { 'Content-Type': 'application/json; charset=utf-8' }); }
        catch { return sendJson(res, 404, { error: 'projeto não encontrado' }); }
      }
      if (req.method === 'PUT') {
        let payload;
        try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'JSON inválido' }); }
        let proj;
        try { proj = JSON.parse(await fsp.readFile(file, 'utf8')); }
        catch { proj = { id, createdAt: new Date().toISOString() }; }
        proj.id = id;
        if (payload.name != null) proj.name = payload.name.toString().slice(0, 200);
        if (payload.data !== undefined) proj.data = payload.data;
        proj.updatedAt = new Date().toISOString();
        await fsp.writeFile(file, JSON.stringify(proj, null, 2));
        return sendJson(res, 200, { id: proj.id, name: proj.name, updatedAt: proj.updatedAt });
      }
      if (req.method === 'DELETE') {
        try { await fsp.unlink(file); } catch {}
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 405, { error: 'método não permitido' });
    }

    // ----- Rotas de página -----
    if (req.method === 'GET' && /^\/p\/[^/]+$/.test(p)) return serveStatic(res, '/index.html');  // editor
    if (req.method === 'GET' && p === '/corte') return serveStatic(res, '/cutplan.html');        // plano de corte
    if (req.method === 'GET' && (p === '/' || p === '/projects')) return serveStatic(res, '/projects.html');
    if (req.method === 'GET') return serveStatic(res, p);

    send(res, 405, 'Método não permitido');
  } catch (e) {
    sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, () => console.log(`Mapa de Peças ouvindo na porta ${PORT} — dados em ${DATA}`));
