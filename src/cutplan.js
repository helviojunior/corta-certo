/* Plano de corte — seleção de peças de vários projetos, empacotamento
   guilhotinado (com kerf e rotação opcional) e relatório/PDF estilo CutList. */
'use strict';

// ---------- Presets de chapa (mm) ----------
const SHEET_PRESETS = [
  { label: 'MDF 2750 × 1850', w: 2750, h: 1850 },
  { label: 'MDF 2750 × 1830', w: 2750, h: 1830 },
  { label: 'MDF/MDP 2440 × 1220', w: 2440, h: 1220 },
  { label: 'Compensado 2200 × 1600', w: 2200, h: 1600 },
  { label: 'Compensado 2200 × 1100', w: 2200, h: 1100 },
  { label: 'Personalizado…', w: null, h: null },
];

const PASTEL = ['#cfe8c4', '#f6d9c2', '#f4ecc2', '#d7e3f5', '#e8d2e6', '#cfe9e6',
                '#f3cfcf', '#e0e0c2', '#d9d2f0', '#f5e0cf'];

const $ = id => document.getElementById(id);

// ---------- Estado ----------
const projectsCache = {};   // id -> {id,name,pieces:[{id,label,color,w,h}]}
let lastPlan = null;        // resultado da última geração (para o PDF)

// ---------- Setup de UI ----------
function initPresets() {
  const sel = $('sheetPreset');
  SHEET_PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = p.label;
    sel.appendChild(o);
  });
  sel.value = '0';
  applyPreset();
  sel.addEventListener('change', applyPreset);
}
function applyPreset() {
  const p = SHEET_PRESETS[+$('sheetPreset').value];
  if (p && p.w) { $('sheetW').value = p.w; $('sheetH').value = p.h; }
}

// ---------- Cache do último tamanho usado (persistido em ./data) ----------
const PREF_IDS = ['sheetPreset', 'sheetW', 'sheetH', 'kerf', 'allowRotate', 'mixedCols'];

async function loadPrefs() {
  let prefs = {};
  try { prefs = await (await fetch('/api/prefs/cutplan')).json(); } catch {}
  if (prefs.preset != null && $('sheetPreset').querySelector(`option[value="${prefs.preset}"]`)) $('sheetPreset').value = prefs.preset;
  applyPreset();   // aplica o preset; depois sobrescreve com os valores salvos
  if (prefs.sheetW) $('sheetW').value = prefs.sheetW;
  if (prefs.sheetH) $('sheetH').value = prefs.sheetH;
  if (prefs.kerf != null) $('kerf').value = prefs.kerf;
  if (prefs.allowRotate != null) $('allowRotate').checked = !!prefs.allowRotate;
  if (prefs.mixedCols != null) $('mixedCols').checked = !!prefs.mixedCols;
}

let prefTimer = null;
function savePrefs() {
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    const body = {
      preset: $('sheetPreset').value,
      sheetW: +$('sheetW').value || null,
      sheetH: +$('sheetH').value || null,
      kerf: +$('kerf').value || 0,
      allowRotate: $('allowRotate').checked,
      mixedCols: $('mixedCols').checked,
    };
    fetch('/api/prefs/cutplan', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {});
  }, 400);
}

function bindPrefs() {
  for (const id of PREF_IDS) {
    const el = $(id); if (!el) continue;
    el.addEventListener('change', savePrefs);
    if (el.tagName === 'INPUT' && el.type === 'number') el.addEventListener('input', savePrefs);
  }
}

// ---------- Carregar projetos e montar a árvore de seleção ----------
async function loadProjects() {
  let list = [];
  try { list = await (await fetch('/api/projects')).json(); } catch {}
  const tree = $('projTree');
  tree.innerHTML = '';
  if (!list.length) { tree.innerHTML = '<p class="hint">Nenhum projeto salvo ainda.</p>'; return; }

  for (const it of list) {
    const wrap = document.createElement('div');
    wrap.className = 'proj-node';
    wrap.innerHTML = `
      <div class="proj-row">
        <button class="proj-toggle" type="button" aria-label="Expandir">▸</button>
        <label class="proj-check">
          <input type="checkbox" class="chk-proj" data-id="${it.id}" />
          <span class="proj-name-t">${escapeHtml(it.name || 'Sem nome')}</span>
          <span class="muted">${it.pieces} peça(s)</span>
        </label>
      </div>
      <ul class="piece-sublist" hidden></ul>`;
    const toggle = wrap.querySelector('.proj-toggle');
    const sublist = wrap.querySelector('.piece-sublist');
    const projChk = wrap.querySelector('.chk-proj');
    let loaded = false;

    const ensurePieces = async () => {
      if (loaded) return;
      const data = await fetchPieces(it.id);
      sublist.innerHTML = '';
      for (const pc of data.pieces) {
        const li = document.createElement('li');
        const dim = (pc.w != null && pc.h != null) ? `${pc.w}×${pc.h} mm` : '— sem medida';
        li.innerHTML = `<label class="piece-check ${pc.w == null ? 'disabled' : ''}">
            <input type="checkbox" class="chk-piece" data-pid="${it.id}" data-id="${pc.id}" ${pc.w == null ? 'disabled' : ''} />
            <span class="piece-swatch" style="background:${pc.color}"></span>
            <span class="piece-name">${escapeHtml(pc.label || '?')}</span>
            <span class="piece-dims">${dim}</span>
          </label>`;
        li.querySelector('.chk-piece')?.addEventListener('change', updateCount);
        sublist.appendChild(li);
      }
      loaded = true;
    };

    toggle.addEventListener('click', async () => {
      const open = sublist.hidden;
      if (open) { await ensurePieces(); sublist.hidden = false; toggle.textContent = '▾'; }
      else { sublist.hidden = true; toggle.textContent = '▸'; }
    });

    projChk.addEventListener('change', async () => {
      await ensurePieces();
      sublist.querySelectorAll('.chk-piece').forEach(c => { if (!c.disabled) c.checked = projChk.checked; });
      updateCount();
    });

    tree.appendChild(wrap);
  }
}

async function fetchPieces(id) {
  if (!projectsCache[id]) projectsCache[id] = await (await fetch(`/api/projects/${id}/pieces`)).json();
  return projectsCache[id];
}

function collectSelected() {
  const items = [];
  for (const c of document.querySelectorAll('.chk-piece:checked')) {
    const pid = c.dataset.pid, id = +c.dataset.id;
    const proj = projectsCache[pid];
    const pc = proj && proj.pieces.find(p => p.id === id);
    if (pc && pc.w != null && pc.h != null) {
      items.push({ w: pc.w, h: pc.h, label: pc.label, color: pc.color, project: proj.name });
    }
  }
  return items;
}

function updateCount() { $('selCount').textContent = collectSelected().length; }

// ---------- Empacotamento guilhotinado por tiras (colunas) ----------
// Cortes válidos para seccionadora: ripa vertical full-height separa colunas;
// crosscut horizontal full-width separa peças dentro da coluna. Peças são
// agrupadas por LARGURA igual → colunas de largura uniforme, sem slivers.

// Escolhe a orientação de cada peça (com rotação opcional), preferindo larguras
// que se repetem entre as peças para formar colunas cheias.
function orientItems(items, W, H, rot) {
  const freq = {};
  for (const it of items) { freq[it.w] = (freq[it.w] || 0) + 1; if (rot) freq[it.h] = (freq[it.h] || 0) + 1; }
  const oriented = [], skipped = [];
  for (const it of items) {
    const a = { w: it.w, h: it.h }, b = { w: it.h, h: it.w };
    const aok = a.w <= W && a.h <= H, bok = rot && b.w <= W && b.h <= H;
    let o = null;
    if (aok && bok) o = (freq[b.w] > freq[a.w]) ? b : a;
    else if (aok) o = a; else if (bok) o = b;
    if (!o) { skipped.push(it); continue; }
    oriented.push({ w: o.w, h: o.h, rot: o.w !== it.w, meta: it });
  }
  return { oriented, skipped };
}

// Monta colunas (largura uniforme) por grupo de largura, empilhando peças
// verticalmente até a altura da chapa (first-fit decreasing).
function buildColumns(oriented, H, kerf) {
  const groups = new Map();
  for (const o of oriented) { if (!groups.has(o.w)) groups.set(o.w, []); groups.get(o.w).push(o); }
  const columns = [];
  for (const [w, arr] of groups) {
    arr.sort((a, b) => b.h - a.h);
    const cols = [];
    for (const it of arr) {
      let placed = false;
      for (const col of cols) {
        const add = col.items.length ? kerf + it.h : it.h;
        if (col.used + add <= H) { col.items.push(it); col.used += add; placed = true; break; }
      }
      if (!placed) cols.push({ w, used: it.h, items: [it] });
    }
    columns.push(...cols);
  }
  return columns;
}

// Distribui as colunas pelas chapas (first-fit ao longo da largura).
function packAll(items, W, H, kerf, rot) {
  const { oriented, skipped } = orientItems(items, W, H, rot);
  const columns = buildColumns(oriented, H, kerf);
  columns.sort((a, b) => b.used - a.used);   // colunas mais altas primeiro

  const bins = [];
  const newBin = () => ({ W, H, x: 0, placed: [], free: [], cuts: 0, cutLen: 0 });
  const startX = bin => (bin.x === 0 ? 0 : bin.x + kerf);

  for (const col of columns) {
    let bin = bins.find(b => startX(b) + col.w <= W);
    if (!bin) { bin = newBin(); bins.push(bin); }
    addColumn(bin, col, kerf);
  }

  // sobra à direita de cada chapa (um retângulo consolidado)
  for (const bin of bins) { const fx = bin.x + (bin.x > 0 ? kerf : 0); if (W - fx > 1) bin.free.push({ x: fx, y: 0, w: W - fx, h: H }); }

  return { bins, skipped };
}

function addColumn(bin, col, kerf) {
  const x = bin.x === 0 ? 0 : bin.x + kerf;
  let y = 0;
  for (const it of col.items) {
    bin.placed.push({ x, y, w: it.w, h: it.h, rot: it.rot, meta: it.meta });
    y += it.h + kerf;
  }
  // sobra no fim da coluna (consolidada)
  if (bin.H - col.used > 1) bin.free.push({ x, y: col.used, w: col.w, h: bin.H - col.used });
  bin.x = x + col.w;
  // cortes: 1 ripa vertical + (n-1) crosscuts
  bin.cuts += 1 + Math.max(0, col.items.length - 1);
  bin.cutLen += bin.H + Math.max(0, col.items.length - 1) * col.w;
}

// ---------- Empacotamento guilhotinado livre (colunas de larguras diferentes) ----------
// Coloca cada peça no melhor retângulo livre (best short-side fit) e divide a
// sobra em dois retângulos por um corte guilhotinado. Mistura larguras numa
// mesma faixa, reaproveitando melhor a chapa (à custa de mais cortes).
function packGuillotine(items, W, H, kerf, rot) {
  const fits = [], skipped = [];
  for (const it of items) {
    const a = it.w <= W && it.h <= H;
    const b = rot && it.h <= W && it.w <= H;
    if (a || b) fits.push(it); else skipped.push(it);
  }
  // maiores primeiro (pelo maior lado, depois área)
  fits.sort((p, q) => Math.max(q.w, q.h) - Math.max(p.w, p.h) || (q.w * q.h - p.w * p.h));

  const bins = [];
  const newBin = () => ({ W, H, x: 0, placed: [], free: [{ x: 0, y: 0, w: W, h: H }], cuts: 0, cutLen: 0 });

  for (const it of fits) {
    let best = null;
    for (const bin of bins) {
      const c = bestFreeFit(bin, it, rot);
      if (c && (!best || c.score < best.score)) best = { bin, ...c };
    }
    if (!best) {
      const bin = newBin();
      const c = bestFreeFit(bin, it, rot);
      if (!c) { skipped.push(it); continue; }
      bins.push(bin);
      best = { bin, ...c };
    }
    placeGuillotine(best.bin, best.fi, it, best.w, best.h, best.rot, kerf);
  }
  for (const bin of bins) {
    bin.cuts = bin.placed.length * 2;   // estimativa: ~1 corte horizontal + 1 vertical por peça
    bin.cutLen = Math.round(bin.placed.reduce((s, p) => s + p.w + p.h, 0));
  }
  return { bins, skipped };
}

// melhor retângulo livre p/ a peça (best short-side fit), considerando rotação
function bestFreeFit(bin, it, rot) {
  const opts = [{ w: it.w, h: it.h, rot: false }];
  if (rot && it.w !== it.h) opts.push({ w: it.h, h: it.w, rot: true });
  let best = null;
  for (let i = 0; i < bin.free.length; i++) {
    const f = bin.free[i];
    for (const o of opts) {
      if (o.w <= f.w + 1e-6 && o.h <= f.h + 1e-6) {
        const score = Math.min(f.w - o.w, f.h - o.h);   // sobra mínima → encaixe mais justo
        if (!best || score < best.score) best = { fi: i, w: o.w, h: o.h, rot: o.rot, score };
      }
    }
  }
  return best;
}

// coloca a peça no canto sup-esq do retângulo livre `fi` e divide a sobra (guilhotina)
function placeGuillotine(bin, fi, it, pw, ph, rotated, kerf) {
  const f = bin.free[fi];
  const x = f.x, y = f.y;
  bin.placed.push({ x, y, w: pw, h: ph, rot: rotated, meta: it });
  bin.free.splice(fi, 1);
  const rw = f.w - pw - kerf;   // sobra à direita (após o kerf)
  const rh = f.h - ph - kerf;   // sobra abaixo (após o kerf)
  // Corte VERTICAL: a sobra da direita mantém a ALTURA CHEIA (vira uma nova coluna
  // reutilizável) e a sobra de baixo continua a coluna atual com a largura da peça.
  // Assim as peças se empilham em colunas e o refugo fica consolidado à direita,
  // em vez de uma faixa horizontal fina com um vão grande embaixo.
  const right  = { x: x + pw + kerf, y,                w: rw, h: f.h };
  const bottom = { x,                y: y + ph + kerf, w: pw, h: rh };
  if (right.w > 1 && right.h > 1) bin.free.push(right);
  if (bottom.w > 1 && bottom.h > 1) bin.free.push(bottom);
}

// ---------- Gerar ----------
function generate() {
  const W = +$('sheetW').value, H = +$('sheetH').value;
  const kerf = +$('kerf').value || 0;
  const rot = $('allowRotate').checked;
  const mixed = $('mixedCols').checked;
  const items = collectSelected();
  if (!W || !H) { uiAlert('Informe o tamanho da chapa.'); return; }
  if (!items.length) { uiAlert('Selecione ao menos uma peça.'); return; }

  const { bins, skipped } = mixed ? packGuillotine(items, W, H, kerf, rot) : packAll(items, W, H, kerf, rot);
  lastPlan = { W, H, kerf, rot, mixed, bins, skipped, items };
  renderReport(lastPlan);
  $('btnExportPdf').disabled = bins.length === 0;
}

// ---------- Renderização do relatório ----------
function renderReport(plan) {
  const { W, H, kerf, bins, skipped, items } = plan;
  const totalSheetArea = W * H * bins.length;
  const usedArea = bins.reduce((s, b) => s + b.placed.reduce((a, p) => a + p.w * p.h, 0), 0);
  const wasted = Math.max(0, totalSheetArea - usedArea);
  const totalCuts = bins.reduce((s, b) => s + b.cuts, 0);
  const totalCutLen = Math.round(bins.reduce((s, b) => s + b.cutLen, 0));
  const usedPct = totalSheetArea ? Math.round(usedArea / totalSheetArea * 100) : 0;

  // resumo de peças agrupadas por tamanho
  const grouped = {};
  for (const it of items) { const k = `${it.w}×${it.h}`; grouped[k] = (grouped[k] || 0) + 1; }
  const panelsSummary = Object.entries(grouped).map(([k, n]) => `${k} <span class="x">×${n}</span>`).join('  \\  ');

  let html = `
    <div class="rep-head">
      <h1 class="rep-title">Plano de Corte</h1>
      <div class="rep-summary">
        <div class="rep-stats">
          <div><span>Chapas utilizadas</span><b>${bins.length}</b></div>
          <div><span>Área total utilizada</span><b>${fmtArea(usedArea)} <i>${usedPct}%</i></b></div>
          <div><span>Área total desperdiçada</span><b>${fmtArea(wasted)} <i>${100 - usedPct}%</i></b></div>
          <div><span>Cortes totais <small>(estim.)</small></span><b>${totalCuts}</b></div>
          <div><span>Comprimento de corte <small>(estim.)</small></span><b>${totalCutLen} mm</b></div>
          <div><span>Espessura de corte</span><b>${kerf} mm</b></div>
        </div>
        <div class="rep-panels">
          <div><span>Peças</span><b>${panelsSummary || '—'}</b></div>
          <div><span>Chapa</span><b>${W}×${H} <span class="x">×${bins.length}</span></b></div>
        </div>
      </div>
    </div>`;

  if (skipped.length) {
    const list = skipped.map(s => `${s.label} (${s.w}×${s.h})`).join(', ');
    html += `<div class="rep-warn">⚠ ${skipped.length} peça(s) não cabem na chapa e foram ignoradas: ${escapeHtml(list)}</div>`;
  }

  bins.forEach((bin, i) => { html += renderSheet(bin, i, W, H, kerf); });

  $('report').innerHTML = html || '<div class="report-empty">Nada para mostrar.</div>';
}

function renderSheet(bin, idx, W, H, kerf) {
  const used = bin.placed.reduce((s, p) => s + p.w * p.h, 0);
  const area = W * H;
  const pct = Math.round(used / area * 100);

  // resumo de peças desta chapa
  const grouped = {};
  for (const p of bin.placed) { const k = `${p.meta.w}×${p.meta.h}`; grouped[k] = (grouped[k] || 0) + 1; }
  const rows = Object.entries(grouped).map(([k, n]) =>
    `<tr><td>${k}</td><td class="ta-r">${n}</td></tr>`).join('');

  return `
    <section class="sheet-block">
      <div class="sheet-side">
        <table class="sheet-info">
          <tr><th>Chapa de stock</th><td>${W}×${H}</td></tr>
          <tr><th>Área utilizada</th><td>${fmtArea(used)} ${pct}%</td></tr>
          <tr><th>Área excedente</th><td>${fmtArea(area - used)} ${100 - pct}%</td></tr>
          <tr><th>Cortes <small>(estim.)</small></th><td>${bin.cuts}</td></tr>
          <tr><th>Peças</th><td>${bin.placed.length}</td></tr>
        </table>
        <table class="sheet-pieces">
          <thead><tr><th>Peça</th><th class="ta-r">Qtd</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="sheet-diagram">
        <div class="sheet-cap">Chapa ${idx + 1} · ${W}×${H} mm</div>
        ${sheetSvg(bin, W, H)}
      </div>
    </section>`;
}

function sheetSvg(bin, W, H) {
  const pad = 60;                         // espaço p/ cotas externas
  const vbW = W + pad, vbH = H + pad;
  const fs = Math.max(W, H) / 75;         // tamanho de fonte relativo (menor = mais legível em peças pequenas)
  let s = `<svg class="svg-sheet" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet">`;
  // chapa
  s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" stroke="#333" stroke-width="${fs * .12}"/>`;
  // sobras (free) em cinza claro com medida
  bin.free.forEach(fr => {
    if (fr.w < 1 || fr.h < 1) return;
    s += `<rect x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.h}" fill="#f0f0f0" stroke="#d8d8d8" stroke-width="${fs * .06}"/>`;
    if (fr.w > fs * 3 && fr.h > fs * 2)
      s += txt(fr.x + fr.w / 2, fr.y + fr.h / 2, `${Math.round(fr.w)}×${Math.round(fr.h)}`, fs * .8, '#9aa', 'middle');
  });
  // peças
  bin.placed.forEach((p, i) => {
    const col = PASTEL[i % PASTEL.length];
    s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${col}" stroke="#7a6a55" stroke-width="${fs * .1}"/>`;
    // dimensões: largura no topo, altura à esquerda — só quando couber o texto
    const wL = String(Math.round(p.w)), hL = String(Math.round(p.h));
    if (p.w > wL.length * fs * 0.62 && p.h > fs * 1.6)
      s += txt(p.x + p.w / 2, p.y + fs * 1.0, wL, fs, '#555', 'middle');
    if (p.h > hL.length * fs * 0.62 && p.w > fs * 1.6)
      s += txtV(p.x + fs * 1.0, p.y + p.h / 2, hL, fs, '#555');
    // rótulo central (peça + projeto)
    if (p.w > fs * 5 && p.h > fs * 4) {
      s += txt(p.x + p.w / 2, p.y + p.h / 2, escapeHtml(p.meta.label || ''), fs * 1.1, '#222', 'middle', 700);
      if (p.meta.project && p.h > fs * 6)
        s += txt(p.x + p.w / 2, p.y + p.h / 2 + fs * 1.5, escapeHtml(p.meta.project), fs * .8, '#666', 'middle');
    }
  });
  // cotas externas da chapa
  s += txt(W / 2, H + pad * .55, `${W}`, fs * 1.3, '#333', 'middle', 700);
  s += txtV(W + pad * .55, H / 2, `${H}`, fs * 1.3, '#333', 700);
  s += `</svg>`;
  return s;
}

function txt(x, y, t, size, fill, anchor = 'start', weight = 400) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" dominant-baseline="middle" font-family="system-ui,sans-serif">${t}</text>`;
}
function txtV(x, y, t, size, fill, weight = 400) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" font-weight="${weight}" dominant-baseline="middle" font-family="system-ui,sans-serif" transform="rotate(-90 ${x} ${y})">${t}</text>`;
}

// ---------- Utilidades ----------
function fmtArea(mm2) { return Math.round(mm2).toLocaleString('pt-BR'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Exportar PDF (impressão) ----------
function exportPdf() {
  if (!lastPlan || !lastPlan.bins.length) return;
  const win = window.open('', '_blank');
  if (!win) { uiAlert('Permita pop-ups para exportar o PDF.'); return; }
  const css = `
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #111; margin: 0; }
    .rep-title { font-size: 20px; margin: 0 0 10px; }
    .rep-head { border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 14px; }
    .rep-summary { display: flex; gap: 30px; flex-wrap: wrap; font-size: 12px; }
    .rep-stats div, .rep-panels div { display: flex; gap: 8px; margin: 2px 0; }
    .rep-stats span, .rep-panels span { color: #555; min-width: 180px; display: inline-block; }
    .rep-stats b i { font-style: normal; color: #888; font-weight: 400; }
    .x { color: #888; }
    .rep-warn { background: #fff4e5; border: 1px solid #f0c98a; padding: 8px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
    .sheet-block { display: flex; gap: 16px; page-break-inside: avoid; margin-bottom: 22px; border-top: 1px solid #ddd; padding-top: 12px; }
    .sheet-side { width: 230px; flex: none; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
    .sheet-info th { text-align: left; color: #555; font-weight: 500; padding: 3px 6px; }
    .sheet-info td { text-align: right; padding: 3px 6px; }
    .sheet-pieces th { background: #eee; text-align: left; padding: 4px 6px; }
    .sheet-pieces td { padding: 3px 6px; border-bottom: 1px solid #eee; }
    .ta-r { text-align: right; }
    .sheet-diagram { flex: 1; min-width: 0; }
    .sheet-cap { font-size: 12px; color: #555; margin-bottom: 6px; }
    .svg-sheet { width: 100%; height: auto; max-height: 230mm; }
    small { color: #999; }
    .print-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ccc;
      font-size: 11px; color: #666; text-align: left; }
  `;
  const appName = (typeof APP_NAME !== 'undefined') ? APP_NAME : 'CortaCerto';
  const appVer = (typeof APP_VERSION !== 'undefined') ? 'v' + APP_VERSION : '';
  const appUrl = (typeof APP_URL !== 'undefined') ? APP_URL : '';
  const footer = `<footer class="print-footer">${appName} ${appVer} · ${appUrl}</footer>`;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Plano de corte — ${appName} ${appVer}</title><style>${css}</style></head>
    <body>${$('report').innerHTML}${footer}
    <script>window.onload=function(){window.focus();window.print();}<\/script>
    </body></html>`);
  win.document.close();
}

// ---------- Init ----------
if (typeof document !== 'undefined') {
  initPresets();
  loadPrefs();
  bindPrefs();
  loadProjects();
  $('btnGenerate').addEventListener('click', generate);
  $('btnExportPdf').addEventListener('click', exportPdf);
}

// Exporta para testes em Node (ignorado no browser)
if (typeof module !== 'undefined') module.exports = { packAll, orientItems, buildColumns };
