/* CortaCerto — editor de canvas + esquemático */
'use strict';

// ---------- Estado ----------
const PALETTE = ['#84cc16', '#ef4444', '#3b82f6', '#22d3ee', '#a3e635',
                 '#ffffff', '#ec4899', '#f8fafc', '#f97316', '#14b8a6', '#eab308'];

const state = {
  image: null,           // HTMLImageElement
  imageData: null,       // dataURL (para salvar)
  imageName: '',
  pieces: [],            // {id,label,colorName,color,x,y,w,h,manual,realW,realH}
  selectedId: null,
  tool: 'select',
  pxPerCm: null,         // calibração global
  refLine: null,         // {x1,y1,x2,y2,cm} em coords de imagem
  totalWidthCm: null,    // override
  totalHeightCm: null,   // override
  view: { scale: 1, x: 0, y: 0 },
  nextId: 1,
  nextLabel: 1,
  crop: null,            // {x,y,w,h} em coords de imagem (seleção de recorte pendente)
  snapHalf: false,       // arredondar medidas para 0,5 cm
  projectId: null,       // UUID do projeto (rota /p/<uuid>)
  projectName: '',       // nome do projeto
};

// ---------- DOM ----------
const canvas = document.getElementById('editor');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const emptyHint = document.getElementById('emptyHint');

// ---------- Utilidades ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = v => Math.round(v * 10) / 10;
// arredonda em cm: 0,5 cm se a opção estiver ativa, senão 0,1 cm
const roundCm = v => state.snapHalf ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10;
// encaixa um comprimento (px) na grade de 0,5 cm — só com a opção ativa e calibrado
const snapPx = lenPx => (state.snapHalf && state.pxPerCm)
  ? Math.round((lenPx / state.pxPerCm) / 0.5) * 0.5 * state.pxPerCm
  : lenPx;
// reencaixa todas as peças automáticas (ao ligar a opção)
function snapAllPieces() {
  if (!state.snapHalf || !state.pxPerCm) return;
  for (const p of state.pieces) {
    if (p.manual) continue;
    p.w = Math.max(2, snapPx(p.w));
    p.h = Math.max(2, snapPx(p.h));
  }
}

function toScreen(px, py) {
  return { x: px * state.view.scale + state.view.x, y: py * state.view.scale + state.view.y };
}
function toImage(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left - state.view.x) / state.view.scale,
    y: (clientY - r.top - state.view.y) / state.view.scale,
  };
}
function getPiece(id) { return state.pieces.find(p => p.id === id); }

// Medidas reais (cm) de uma peça
function pieceDims(p) {
  if (p.manual) return { w: p.realW ?? null, h: p.realH ?? null };
  if (state.pxPerCm) return { w: roundCm(p.w / state.pxPerCm), h: roundCm(p.h / state.pxPerCm) };
  return { w: null, h: null };
}

function boundingBox() {
  if (!state.pieces.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of state.pieces) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function totalDims() {
  const bb = boundingBox();
  let w = state.totalWidthCm, h = state.totalHeightCm;
  if ((w == null || h == null) && bb && state.pxPerCm) {
    if (w == null) w = roundCm(bb.w / state.pxPerCm);
    if (h == null) h = roundCm(bb.h / state.pxPerCm);
  }
  return { w, h };
}

// ---------- Canvas sizing ----------
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // baseline; render desenha em coords CSS
  render();
}

function fitView() {
  if (!state.image) return;
  const r = canvas.getBoundingClientRect();
  const s = Math.min(r.width / state.image.naturalWidth, r.height / state.image.naturalHeight) * 0.92;
  state.view.scale = s;
  state.view.x = (r.width - state.image.naturalWidth * s) / 2;
  state.view.y = (r.height - state.image.naturalHeight * s) / 2;
}

// ---------- Render do editor ----------
const HANDLE = 8; // px tela
function render() {
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  if (state.image) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr * state.view.scale, 0, 0, dpr * state.view.scale, dpr * state.view.x, dpr * state.view.y);
    ctx.drawImage(state.image, 0, 0);
    ctx.restore();
  }

  // peças
  for (const p of state.pieces) {
    const a = toScreen(p.x, p.y);
    const w = p.w * state.view.scale, h = p.h * state.view.scale;
    ctx.fillStyle = hexToRgba(p.color, 0.18);
    ctx.fillRect(a.x, a.y, w, h);
    ctx.lineWidth = p.id === state.selectedId ? 3 : 2;
    ctx.strokeStyle = p.color;
    ctx.strokeRect(a.x, a.y, w, h);

    // rótulo
    const d = pieceDims(p);
    const label = p.label + (d.w != null && d.h != null ? `  ${d.w}×${d.h}cm` : '');
    ctx.font = '600 13px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const lx = a.x + w / 2, ly = a.y + h / 2;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(lx - tw / 2 - 5, ly - 11, tw + 10, 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);

    if (p.id === state.selectedId) drawHandles(a.x, a.y, w, h);
  }

  // overlay de recorte (seleção pendente ou em arraste)
  const cr = getCropRect();
  if (cr) {
    const a = toScreen(cr.x, cr.y);
    const w = cr.w * state.view.scale, h = cr.h * state.view.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath();
    ctx.rect(0, 0, r.width, r.height);          // tudo
    ctx.rect(a.x, a.y, w, h);                    // buraco (evenodd)
    ctx.fill('evenodd');
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(a.x, a.y, w, h); ctx.setLineDash([]);
    drawHandles(a.x, a.y, w, h);
    ctx.restore();
  }

  // arraste de criação
  if (drag && drag.mode === 'create') {
    const a = toScreen(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1));
    const w = Math.abs(drag.x1 - drag.x0) * state.view.scale;
    const h = Math.abs(drag.y1 - drag.y0) * state.view.scale;
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
    ctx.strokeRect(a.x, a.y, w, h); ctx.setLineDash([]);
  }
  if (drag && drag.mode === 'calibrate') {
    const s1 = toScreen(drag.x0, drag.y0), s2 = toScreen(drag.x1, drag.y1);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawHandles(x, y, w, h) {
  const pts = handlePoints(x, y, w, h);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;
  for (const k in pts) {
    ctx.beginPath();
    ctx.rect(pts[k].x - HANDLE / 2, pts[k].y - HANDLE / 2, HANDLE, HANDLE);
    ctx.fill(); ctx.stroke();
  }
}
function handlePoints(x, y, w, h) {
  return {
    nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 },
  };
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- Interação ----------
let drag = null;

function hitHandle(p, sx, sy) {
  const a = toScreen(p.x, p.y);
  const pts = handlePoints(a.x, a.y, p.w * state.view.scale, p.h * state.view.scale);
  for (const k in pts) {
    if (Math.abs(sx - pts[k].x) <= HANDLE && Math.abs(sy - pts[k].y) <= HANDLE) return k;
  }
  return null;
}
function pieceAt(ix, iy) {
  for (let i = state.pieces.length - 1; i >= 0; i--) {
    const p = state.pieces[i];
    if (ix >= p.x && ix <= p.x + p.w && iy >= p.y && iy <= p.y + p.h) return p;
  }
  return null;
}

canvas.addEventListener('mousedown', e => {
  if (!state.image) return;
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const img = toImage(e.clientX, e.clientY);

  // pan: botão do meio ou espaço
  if (e.button === 1 || spaceDown) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: state.view.x, oy: state.view.y };
    return;
  }

  if (state.tool === 'calibrate') {
    drag = { mode: 'calibrate', x0: img.x, y0: img.y, x1: img.x, y1: img.y };
    return;
  }
  if (state.tool === 'crop') {
    drag = { mode: 'crop', x0: img.x, y0: img.y, x1: img.x, y1: img.y };
    state.crop = null; hideCropBar();
    return;
  }
  if (state.tool === 'rect') {
    drag = { mode: 'create', x0: img.x, y0: img.y, x1: img.x, y1: img.y };
    return;
  }
  // select
  const sel = getPiece(state.selectedId);
  if (sel) {
    const handle = hitHandle(sel, sx, sy);
    if (handle) { drag = { mode: 'resize', handle, p: sel, start: { ...sel }, img }; return; }
  }
  const hit = pieceAt(img.x, img.y);
  if (hit) {
    selectPiece(hit.id);
    drag = { mode: 'move', p: hit, dx: img.x - hit.x, dy: img.y - hit.y };
  } else {
    selectPiece(null);
  }
});

window.addEventListener('mousemove', e => {
  if (!drag) return;
  if (drag.mode === 'pan') {
    state.view.x = drag.ox + (e.clientX - drag.sx);
    state.view.y = drag.oy + (e.clientY - drag.sy);
    render(); return;
  }
  const img = toImage(e.clientX, e.clientY);
  if (drag.mode === 'create') {
    // encaixa o tamanho na grade de 0,5 cm enquanto desenha (mantendo o canto inicial)
    const sx = (img.x < drag.x0 ? -1 : 1), sy = (img.y < drag.y0 ? -1 : 1);
    drag.x1 = drag.x0 + sx * snapPx(Math.abs(img.x - drag.x0));
    drag.y1 = drag.y0 + sy * snapPx(Math.abs(img.y - drag.y0));
    render();
  } else if (drag.mode === 'calibrate' || drag.mode === 'crop') {
    drag.x1 = img.x; drag.y1 = img.y; render();
  } else if (drag.mode === 'move') {
    drag.p.x = img.x - drag.dx; drag.p.y = img.y - drag.dy;
    render(); syncProps();
  } else if (drag.mode === 'resize') {
    applyResize(drag, img); render(); syncProps();
  }
});

window.addEventListener('mouseup', e => {
  if (!drag) return;
  if (drag.mode === 'create') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    if (w > 5 && h > 5) addPiece(x, y, w, h);
    // mantém a ferramenta "Peça" ativa para desenhar várias peças em sequência
  } else if (drag.mode === 'calibrate') {
    const len = Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0);
    if (len > 4) {
      const cm = parseFloat(prompt('Tamanho real desta linha (cm):', '10'));
      if (cm > 0) {
        state.pxPerCm = len / cm;
        state.refLine = { x1: drag.x0, y1: drag.y0, x2: drag.x1, y2: drag.y1, cm };
        updateScaleInfo(); renderPieceList(); syncProps(); scheduleSave();
      }
    }
    setTool('select');
  } else if (drag.mode === 'crop') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    const iw = state.image.naturalWidth, ih = state.image.naturalHeight;
    const cx = clamp(x, 0, iw), cy = clamp(y, 0, ih);
    const cw = clamp(x + w, 0, iw) - cx, ch = clamp(y + h, 0, ih) - cy;
    if (cw > 8 && ch > 8) { state.crop = { x: cx, y: cy, w: cw, h: ch }; showCropBar(); }
    else { state.crop = null; hideCropBar(); }
  } else if (drag.mode === 'move' || drag.mode === 'resize') {
    scheduleSave();
  }
  drag = null; render();
});

function applyResize(d, img) {
  const p = d.p, s = d.start;
  let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
  const h = d.handle;
  if (h.includes('w')) x1 = img.x;
  if (h.includes('e')) x2 = img.x;
  if (h.includes('n')) y1 = img.y;
  if (h.includes('s')) y2 = img.y;
  // encaixa a borda que se move na grade de 0,5 cm, mantendo a borda oposta fixa
  if (state.snapHalf && state.pxPerCm) {
    if (h.includes('w')) x1 = x2 - snapPx(x2 - x1);
    if (h.includes('e')) x2 = x1 + snapPx(x2 - x1);
    if (h.includes('n')) y1 = y2 - snapPx(y2 - y1);
    if (h.includes('s')) y2 = y1 + snapPx(y2 - y1);
  }
  p.x = Math.min(x1, x2); p.y = Math.min(y1, y2);
  p.w = Math.max(2, Math.abs(x2 - x1)); p.h = Math.max(2, Math.abs(y2 - y1));
}

// zoom com a roda
canvas.addEventListener('wheel', e => {
  if (!state.image) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  state.view.x = sx - (sx - state.view.x) * factor;
  state.view.y = sy - (sy - state.view.y) * factor;
  state.view.scale *= factor;
  render();
}, { passive: false });

// teclado
let spaceDown = false;
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; }
  if (e.key === 'v' || e.key === 'V') setTool('select');
  if (e.key === 'r' || e.key === 'R') setTool('rect');
  if (e.key === 'c' || e.key === 'C') setTool('calibrate');
  if (e.key === 'x' || e.key === 'X') setTool('crop');
  if (e.key === 'Enter' && state.crop) { e.preventDefault(); applyCrop(); return; }
  if (e.key === 'Escape') { if (state.crop) cancelCrop(); else selectPiece(null); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) { deleteSelected(); }
  const sel = getPiece(state.selectedId);
  if (sel && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') sel.y -= step;
    if (e.key === 'ArrowDown') sel.y += step;
    if (e.key === 'ArrowLeft') sel.x -= step;
    if (e.key === 'ArrowRight') sel.x += step;
    render(); syncProps(); scheduleSave();
  }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = ''; } });

// ---------- Peças ----------
function addPiece(x, y, w, h) {
  const color = PALETTE[(state.nextLabel - 1) % PALETTE.length];
  const p = {
    id: state.nextId++, label: 'D' + state.nextLabel++, colorName: '',
    color, x, y, w, h, manual: false, realW: null, realH: null,
  };
  state.pieces.push(p);
  selectPiece(p.id);
  renderPieceList();
  scheduleSave();
}

function deleteSelected() {
  state.pieces = state.pieces.filter(p => p.id !== state.selectedId);
  selectPiece(null); renderPieceList();
  scheduleSave();
}

function deleteAllPieces() {
  if (!state.pieces.length) return;
  if (!confirm(`Excluir todas as ${state.pieces.length} peça(s)? Esta ação não pode ser desfeita.`)) return;
  state.pieces = [];
  state.nextId = 1; state.nextLabel = 1;
  selectPiece(null); renderPieceList();
  scheduleSave();
}

function selectPiece(id) {
  state.selectedId = id;
  renderPieceList(); render(); syncProps();
}

// ---------- Camadas (z-order) ----------
// A ordem do array define o empilhamento: índice 0 = atrás, último = frente.
function reorderPiece(dir) {
  const i = state.pieces.findIndex(p => p.id === state.selectedId);
  if (i < 0) return;
  const [p] = state.pieces.splice(i, 1);
  let j;
  if (dir === 'front') j = state.pieces.length;
  else if (dir === 'back') j = 0;
  else if (dir === 'up') j = Math.min(state.pieces.length, i + 1);
  else j = Math.max(0, i - 1);
  state.pieces.splice(j, 0, p);
  render(); renderPieceList();
  scheduleSave();
}

// ---------- Recorte ----------
const cropBar = document.getElementById('cropBar');
function getCropRect() {
  if (drag && drag.mode === 'crop') {
    return { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
             w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  }
  return state.crop;
}
function showCropBar() {
  const c = state.crop; if (!c) return;
  const cm = state.pxPerCm ? `  (${roundCm(c.w / state.pxPerCm)}×${roundCm(c.h / state.pxPerCm)} cm)` : '';
  document.getElementById('cropDims').textContent = `${Math.round(c.w)}×${Math.round(c.h)} px${cm}`;
  cropBar.hidden = false;
}
function hideCropBar() { cropBar.hidden = true; }
function cancelCrop() { state.crop = null; hideCropBar(); render(); }

function applyCrop() {
  const c = state.crop; if (!c || !state.image) return;
  const x = Math.round(c.x), y = Math.round(c.y), w = Math.round(c.w), h = Math.round(c.h);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(state.image, x, y, w, h, 0, 0, w, h);
  const url = cv.toDataURL('image/png');
  // reposiciona peças e calibração para o novo referencial
  for (const p of state.pieces) { p.x -= x; p.y -= y; }
  if (state.refLine) { state.refLine.x1 -= x; state.refLine.y1 -= y; state.refLine.x2 -= x; state.refLine.y2 -= y; }
  state.crop = null; hideCropBar();
  loadImage(url, state.imageName);   // mantém escala (px/cm) e refaz o fit
  setTool('select');
  renderPieceList();
}

// ---------- Sidebar ----------
const pieceListEl = document.getElementById('pieceList');
const pieceCountEl = document.getElementById('pieceCount');
const propsPanel = document.getElementById('propsPanel');

let dragSrcId = null;
function renderPieceList() {
  pieceCountEl.textContent = state.pieces.length;
  pieceListEl.innerHTML = '';
  for (const p of state.pieces) {
    const d = pieceDims(p);
    const li = document.createElement('li');
    li.className = 'piece-item' + (p.id === state.selectedId ? ' selected' : '');
    li.draggable = true;
    li.dataset.id = p.id;
    li.innerHTML = `<span class="piece-handle" title="Arraste para reordenar">⋮⋮</span>
      <span class="piece-swatch" style="background:${p.color}"></span>
      <span class="piece-name">${p.label}</span>
      <span class="piece-dims">${d.w != null ? d.w + '×' + d.h + ' cm' : '—'}</span>`;
    li.addEventListener('click', () => selectPiece(p.id));

    // arrastar para reordenar (a ordem define o empilhamento: topo = trás)
    li.addEventListener('dragstart', e => {
      dragSrcId = p.id; li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(p.id));
    });
    li.addEventListener('dragend', () => { dragSrcId = null; li.classList.remove('dragging'); clearDropMarks(); });
    li.addEventListener('dragover', e => {
      if (dragSrcId == null || dragSrcId === p.id) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      li.classList.add(isAfter(e, li) ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', e => {
      e.preventDefault();
      const after = isAfter(e, li);
      clearDropMarks();
      if (dragSrcId != null && dragSrcId !== p.id) movePieceRelativeTo(dragSrcId, p.id, after);
    });

    pieceListEl.appendChild(li);
  }
}
function isAfter(e, li) { const r = li.getBoundingClientRect(); return (e.clientY - r.top) > r.height / 2; }
function clearDropMarks() { pieceListEl.querySelectorAll('.piece-item').forEach(el => el.classList.remove('drop-before', 'drop-after')); }
function movePieceRelativeTo(srcId, targetId, after) {
  const from = state.pieces.findIndex(p => p.id === srcId);
  if (from < 0) return;
  const [p] = state.pieces.splice(from, 1);
  let to = state.pieces.findIndex(pp => pp.id === targetId);
  if (to < 0) state.pieces.push(p);
  else state.pieces.splice(after ? to + 1 : to, 0, p);
  render(); renderPieceList(); scheduleSave();
}

const F = id => document.getElementById(id);
function syncProps() {
  const p = getPiece(state.selectedId);
  if (!p) { propsPanel.hidden = true; return; }
  propsPanel.hidden = false;
  F('pLabel').value = p.label;
  F('pColorName').value = p.colorName || '';
  F('pColor').value = p.color.length === 7 ? p.color : '#ffffff';
  F('pManual').checked = p.manual;
  const d = pieceDims(p);
  F('pRealW').value = d.w ?? '';
  F('pRealH').value = d.h ?? '';
  F('pRealW').disabled = !p.manual; F('pRealH').disabled = !p.manual;
  F('pX').value = Math.round(p.x); F('pY').value = Math.round(p.y);
  F('pW').value = Math.round(p.w); F('pH').value = Math.round(p.h);
}

function bindProps() {
  const upd = fn => () => { const p = getPiece(state.selectedId); if (!p) return; fn(p); render(); renderPieceList(); scheduleSave(); };
  F('pLabel').addEventListener('input', upd(p => p.label = F('pLabel').value));
  F('pColorName').addEventListener('input', upd(p => p.colorName = F('pColorName').value));
  F('pColor').addEventListener('input', upd(p => p.color = F('pColor').value));
  F('pManual').addEventListener('change', upd(p => {
    p.manual = F('pManual').checked;
    if (p.manual && p.realW == null) { const d = pieceDims(p); p.realW = d.w; p.realH = d.h; }
    syncProps();
  }));
  F('pRealW').addEventListener('input', upd(p => p.realW = parseFloat(F('pRealW').value) || 0));
  F('pRealH').addEventListener('input', upd(p => p.realH = parseFloat(F('pRealH').value) || 0));
  for (const k of ['pX', 'pY', 'pW', 'pH']) {
    F(k).addEventListener('input', upd(p => {
      p.x = +F('pX').value; p.y = +F('pY').value;
      p.w = Math.max(2, +F('pW').value); p.h = Math.max(2, +F('pH').value);
    }));
  }
  F('btnDelete').addEventListener('click', deleteSelected);
  F('totalW').addEventListener('input', () => { state.totalWidthCm = F('totalW').value ? +F('totalW').value : null; scheduleSave(); });
  F('totalH').addEventListener('input', () => { state.totalHeightCm = F('totalH').value ? +F('totalH').value : null; scheduleSave(); });

  // nome do projeto
  const nameEl = F('projName');
  if (nameEl) nameEl.addEventListener('input', () => { state.projectName = nameEl.value; scheduleSave(); });

  // camadas (z-order)
  F('btnLayerFront').addEventListener('click', () => reorderPiece('front'));
  F('btnLayerUp').addEventListener('click', () => reorderPiece('up'));
  F('btnLayerDown').addEventListener('click', () => reorderPiece('down'));
  F('btnLayerBack').addEventListener('click', () => reorderPiece('back'));

  // arredondamento 0,5 cm
  F('snapHalf').addEventListener('change', () => {
    state.snapHalf = F('snapHalf').checked;
    if (state.snapHalf) snapAllPieces();
    render(); renderPieceList(); syncProps(); scheduleSave();
  });

  // barra de recorte
  F('btnCropApply').addEventListener('click', applyCrop);
  F('btnCropCancel').addEventListener('click', cancelCrop);
}

function updateScaleInfo() {
  const el = document.getElementById('scaleInfo');
  el.textContent = state.pxPerCm ? `${round1(state.pxPerCm)} px/cm — calibrada` : 'Não calibrada';
  el.style.color = state.pxPerCm ? '#84cc16' : '';
}

// ---------- Ferramentas ----------
function setTool(t) {
  if (t !== 'crop') cancelCrop();
  state.tool = t;
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  statusEl.textContent = {
    select: 'Selecionar / mover / redimensionar',
    rect: 'Arraste para desenhar uma peça',
    calibrate: 'Arraste sobre uma medida conhecida',
    crop: 'Arraste para selecionar a área e clique em Aplicar recorte',
  }[t];
}
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

// ---------- Imagem ----------
document.getElementById('imageInput').addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = '';
});

// Carrega um File: imagem -> fundo; .json -> projeto
function handleFile(file) {
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result, file.name);
    reader.readAsDataURL(file);
  } else if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = () => { try { loadProject(JSON.parse(reader.result), { save: true }); } catch (err) { alert('Arquivo inválido: ' + err.message); } };
    reader.readAsText(file);
  } else {
    alert('Tipo de arquivo não suportado: ' + (file.type || file.name));
  }
}

function loadImage(dataUrl, name, opts = {}) {
  const img = new Image();
  img.onload = () => {
    state.image = img; state.imageData = dataUrl; state.imageName = name || '';
    emptyHint.style.display = 'none';
    fitView(); render();
    statusEl.textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
    suppressSave = false;
    if (opts.save !== false) scheduleSave();
  };
  img.onerror = () => alert('Não foi possível carregar a imagem.');
  img.src = dataUrl;
}

// --- Arrastar e soltar ---
const stageEl = document.querySelector('.stage');
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; stageEl.classList.add('dragover'); });
window.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; stageEl.classList.remove('dragover'); } });
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; stageEl.classList.remove('dragover');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// --- Colar imagem (Ctrl/Cmd+V) ---
window.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) { handleFile(new File([f], f.name || 'colado.png', { type: it.type })); break; }
    }
  }
});

// --- Clicar na área vazia abre o seletor de imagem ---
stageEl.addEventListener('click', () => { if (!state.image) document.getElementById('imageInput').click(); });

// ---------- Serialização ----------
function serializeProject() {
  return {
    version: 1, app: 'mapa-pecas-madeira',
    image: { dataUrl: state.imageData, name: state.imageName,
      width: state.image ? state.image.naturalWidth : 0, height: state.image ? state.image.naturalHeight : 0 },
    scale: { pxPerCm: state.pxPerCm, refLine: state.refLine },
    total: { widthCm: state.totalWidthCm, heightCm: state.totalHeightCm },
    options: { snapHalf: state.snapHalf },
    pieces: state.pieces,
  };
}

// ---------- Persistência no servidor (auto-save em ./data) ----------
let suppressSave = false;          // evita salvar durante o carregamento do projeto
let saveTimer = null, saving = false, dirtyAgain = false;

function setSaveStatus(s) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  const map = { saved: '✓ Salvo', saving: '⏳ Salvando…', dirty: '● Não salvo', error: '⚠ Erro ao salvar' };
  el.textContent = map[s] || '—';
  el.style.color = s === 'error' ? '#ffb4b4' : (s === 'saved' ? '#84cc16' : '');
}

function scheduleSave() {
  if (suppressSave || !state.projectId) return;
  setSaveStatus('dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

async function saveNow() {
  if (!state.projectId) return;
  if (saving) { dirtyAgain = true; return; }
  saving = true; setSaveStatus('saving');
  try {
    const r = await fetch(`/api/projects/${state.projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.projectName, data: serializeProject() }),
    });
    setSaveStatus(r.ok ? 'saved' : 'error');
  } catch { setSaveStatus('error'); }
  saving = false;
  if (dirtyAgain) { dirtyAgain = false; scheduleSave(); }
}

// salva o que der ao sair (melhor esforço)
window.addEventListener('beforeunload', () => {
  if (!state.projectId || suppressSave) return;
  try {
    fetch(`/api/projects/${state.projectId}`, {
      method: 'PUT', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.projectName, data: serializeProject() }),
    });
  } catch {}
});

// ---------- Salvar / Abrir (exportar/importar .json) ----------
document.getElementById('btnSaveJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serializeProject(), null, 2)], { type: 'application/json' });
  const base = state.projectName || state.imageName.replace(/\.[^.]+$/, '') || 'projeto';
  download(blob, base + '-pecas.json');
});

document.getElementById('loadInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { loadProject(JSON.parse(reader.result), { save: true }); }
    catch (err) { alert('Arquivo inválido: ' + err.message); }
  };
  reader.readAsText(file);
});

function loadProject(d, { save = false } = {}) {
  suppressSave = true;   // não dispara auto-save durante o carregamento em massa
  d = d || {};
  state.pieces = (d.pieces || []).map(p => ({ ...p }));
  state.pxPerCm = d.scale?.pxPerCm ?? null;
  state.refLine = d.scale?.refLine ?? null;
  state.totalWidthCm = d.total?.widthCm ?? null;
  state.totalHeightCm = d.total?.heightCm ?? null;
  state.snapHalf = d.options?.snapHalf ?? false;
  state.nextId = Math.max(0, ...state.pieces.map(p => p.id || 0)) + 1;
  state.nextLabel = state.pieces.length + 1;
  F('totalW').value = state.totalWidthCm ?? '';
  F('totalH').value = state.totalHeightCm ?? '';
  F('snapHalf').checked = state.snapHalf;
  updateScaleInfo(); renderPieceList(); selectPiece(null);
  if (d.image?.dataUrl) loadImage(d.image.dataUrl, d.image.name, { save });
  else { render(); suppressSave = false; if (save) scheduleSave(); }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Esquemático ----------
const modal = document.getElementById('schematicModal');
document.getElementById('btnSchematic').addEventListener('click', () => {
  if (!state.pieces.length) { alert('Desenhe ao menos uma peça primeiro.'); return; }
  modal.hidden = false;
  drawSchematic();
});
document.getElementById('btnCloseModal').addEventListener('click', () => modal.hidden = true);
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
document.getElementById('btnExportPng').addEventListener('click', () => {
  const base = (state.projectName || 'esquematico').replace(/[^\w\-]+/g, '_');
  document.getElementById('schematic').toBlob(b => download(b, base + '.png'), 'image/png');
});
document.getElementById('btnExportPdf').addEventListener('click', exportPdf);

// ---------- Temas do esquemático ----------
// 'screen' = visual escuro (tela); 'print' = otimizado p/ impressão (fundo branco,
// imagem com 50% de transparência, textos e cotas escuros).
const THEMES = {
  screen: {
    bg: '#111317', title: '#f3f4f6', subtitle: '#9ca3af', footer: '#6b7280',
    grid: 'rgba(255,255,255,.06)', cardBox: '#1c1f26',
    imageAlpha: 1, pieceFillAlpha: 0.12, pieceFillNoImg: '#1c1f26',
    chipBg: 'rgba(0,0,0,.55)', chipText: '#f3f4f6',
    dimLine: '#9ca3af', dimText: '#e5e7eb', tick: '#6b7280', arrow: '#9ca3af',
  },
  print: {
    bg: '#ffffff', title: '#111317', subtitle: '#374151', footer: '#6b7280',
    grid: 'rgba(0,0,0,.06)', cardBox: '#ffffff',
    imageAlpha: 0.5, pieceFillAlpha: 0.10, pieceFillNoImg: '#f3f4f6',
    chipBg: 'rgba(255,255,255,.72)', chipText: '#111317',
    dimLine: '#4b5563', dimText: '#111317', tick: '#9ca3af', arrow: '#4b5563',
    darkenPieces: true,   // escurece cores claras p/ contraste no fundo branco
  },
};
let theme = THEMES.screen;

// Adapta a cor da peça ao tema ativo: no modo impressão (fundo branco),
// escurece cores muito claras mantendo o matiz, garantindo contraste.
function pieceColor(hex) {
  if (!theme.darkenPieces) return hex;
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  let r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const bright = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const MAX = 0.5;   // brilho percebido máximo no papel
  if (bright > MAX) {
    const f = MAX / bright;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Renderiza no tema 'print' (fundo branco, imagem 50%) e abre o diálogo de
// impressão do navegador — o usuário escolhe "Salvar como PDF". Sem dependências.
function exportPdf() {
  if (!state.pieces.length) { alert('Desenhe ao menos uma peça primeiro.'); return; }
  const cv = document.createElement('canvas');
  drawSchematic('print', cv);
  const url = cv.toDataURL('image/png');
  const win = window.open('', '_blank');
  if (!win) { alert('Permita pop-ups para exportar o PDF.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Esquemático — ${state.projectName || state.imageName || 'peças'}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      img { width: 100%; height: auto; display: block; }
    </style></head>
    <body><img src="${url}" onload="window.focus();window.print();"></body></html>`);
  win.document.close();
}

drawSchematicSetup();
function drawSchematicSetup() { /* placeholder for module clarity */ }

function drawSchematic(themeName = 'screen', targetCanvas) {
  theme = THEMES[themeName] || THEMES.screen;
  const cv = targetCanvas || document.getElementById('schematic');
  const g = cv.getContext('2d');
  // grade de cards à direita (define a altura necessária do canvas)
  const cols = 2, gapX = 40, gapY = 40, gridX = 1010, gridY = 100, cellW = 380, cellH = 270;
  const rows = Math.max(1, Math.ceil(state.pieces.length / cols));
  const rightBottom = gridY + rows * cellH + (rows - 1) * gapY;
  const leftBottom = 150 + 940;
  const W = 1900, H = Math.max(leftBottom, rightBottom) + 70;
  cv.width = W; cv.height = H;
  g.fillStyle = theme.bg; g.fillRect(0, 0, W, H);

  const bb = boundingBox();
  const colorName = p => p.colorName ? ` (${p.colorName})` : '';

  // ----- Painel esquerdo: layout -----
  const Ltitle = (state.projectName || 'ESQUEMA DE PEÇAS').toUpperCase();
  g.fillStyle = theme.title; g.font = '700 26px system-ui'; g.textAlign = 'left';
  g.fillText(Ltitle, 40, 50);
  const td = totalDims();
  g.fillStyle = theme.subtitle; g.font = '500 16px system-ui';
  g.fillText(`LARGURA TOTAL: ${td.w ?? '—'} cm   |   ALTURA TOTAL: ${td.h ?? '—'} cm`, 40, 78);

  // área de desenho do layout
  const area = { x: 130, y: 150, w: 820, h: 940 };
  let L;
  if (state.image) {
    // usa a imagem (recortada) inteira como fundo
    const iw = state.image.naturalWidth, ih = state.image.naturalHeight;
    const sc = Math.min(area.w / iw, area.h / ih);
    const dw = iw * sc, dh = ih * sc;
    const ox = area.x + (area.w - dw) / 2, oy = area.y + (area.h - dh) / 2;
    L = (px, py) => ({ x: ox + px * sc, y: oy + py * sc });
    g.save();
    g.globalAlpha = theme.imageAlpha;   // 50% no modo impressão p/ economizar tinta
    g.drawImage(state.image, ox, oy, dw, dh);
    g.restore();
  } else {
    // sem imagem: usa a caixa das peças
    const sc = Math.min(area.w / bb.w, area.h / bb.h);
    const ox = area.x + (area.w - bb.w * sc) / 2, oy = area.y + (area.h - bb.h * sc) / 2;
    L = (px, py) => ({ x: ox + (px - bb.minX) * sc, y: oy + (py - bb.minY) * sc });
  }
  const p0 = L(bb.minX, bb.minY), p1 = L(bb.maxX, bb.maxY);

  // grade suave somente no plano do layout/imagem
  g.save();
  g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
  g.strokeStyle = theme.grid; g.lineWidth = 1;
  for (let gx = area.x; gx <= area.x + area.w; gx += 40) { g.beginPath(); g.moveTo(gx + .5, area.y); g.lineTo(gx + .5, area.y + area.h); g.stroke(); }
  for (let gy = area.y; gy <= area.y + area.h; gy += 40) { g.beginPath(); g.moveTo(area.x, gy + .5); g.lineTo(area.x + area.w, gy + .5); g.stroke(); }
  g.restore();

  // peças contornadas por cima
  for (const p of state.pieces) {
    const a = L(p.x, p.y), b = L(p.x + p.w, p.y + p.h);
    const pc = pieceColor(p.color);
    g.fillStyle = state.image ? hexToRgba(pc, theme.pieceFillAlpha) : theme.pieceFillNoImg;
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.lineWidth = 3; g.strokeStyle = pc;
    g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    // rótulo com chip para boa leitura sobre a foto
    const cxp = (a.x + b.x) / 2, cyp = (a.y + b.y) / 2;
    g.font = '700 18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(p.label).width;
    g.fillStyle = theme.chipBg; g.fillRect(cxp - tw / 2 - 7, cyp - 13, tw + 14, 26);
    g.fillStyle = theme.chipText; g.fillText(p.label, cxp, cyp);
  }

  // dimensão total no topo
  dimH(g, p0.x, p1.x, p0.y - 35, (td.w ?? '—') + ' cm');
  // dimensão total à esquerda
  dimV(g, p0.y, p1.y, p0.x - 55, (td.h ?? '—') + ' cm');

  // ----- Painel direito: medidas individuais -----
  g.fillStyle = theme.title; g.font = '700 24px system-ui'; g.textAlign = 'left';
  g.fillText('MEDIDAS INDIVIDUAIS DAS PEÇAS', 1010, 50);

  state.pieces.forEach((p, i) => {
    const cx = gridX + (i % cols) * (cellW + gapX);
    const cy = gridY + Math.floor(i / cols) * (cellH + gapY);
    drawPieceCard(g, p, cx, cy, cellW, cellH, colorName(p));
  });

  // rodapé (notas)
  g.fillStyle = theme.footer; g.font = '500 14px system-ui'; g.textAlign = 'left';
  g.fillText('Gerado com CortaCerto · medidas em cm', 40, H - 20);
}

function drawPieceCard(g, p, x, y, w, h, suffix) {
  // título
  g.fillStyle = theme.title; g.font = '700 17px system-ui'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText(p.label + suffix, x, y + 4);

  const d = pieceDims(p);
  const box = { x: x + 55, y: y + 30, w: w - 90, h: h - 90 };
  // proporção real da peça
  const ar = (p.w && p.h) ? p.w / p.h : 1;
  let bw = box.w, bh = box.w / ar;
  if (bh > box.h) { bh = box.h; bw = box.h * ar; }
  const rx = box.x + (box.w - bw) / 2, ry = box.y;

  g.fillStyle = theme.cardBox; g.fillRect(rx, ry, bw, bh);
  g.lineWidth = 3; g.strokeStyle = pieceColor(p.color); g.strokeRect(rx, ry, bw, bh);

  // largura (embaixo) e altura (esquerda)
  dimH(g, rx, rx + bw, ry + bh + 24, (d.w ?? '—') + ' cm');
  dimV(g, ry, ry + bh, rx - 26, (d.h ?? '—') + ' cm');
}

// linhas de cota
function dimH(g, x1, x2, y, text) {
  g.strokeStyle = theme.dimLine; g.lineWidth = 1; g.beginPath();
  g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
  arrow(g, x1, y, 1); arrow(g, x2, y, -1);
  tick(g, x1, y, true); tick(g, x2, y, true);
  g.fillStyle = theme.dimText; g.font = '600 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(text, (x1 + x2) / 2, y - 5);
}
function dimV(g, y1, y2, x, text) {
  g.strokeStyle = theme.dimLine; g.lineWidth = 1; g.beginPath();
  g.moveTo(x, y1); g.lineTo(x, y2); g.stroke();
  arrowV(g, x, y1, 1); arrowV(g, x, y2, -1);
  tick(g, x, y1, false); tick(g, x, y2, false);
  g.save(); g.translate(x - 6, (y1 + y2) / 2); g.rotate(-Math.PI / 2);
  g.fillStyle = theme.dimText; g.font = '600 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(text, 0, 0); g.restore();
}
function arrow(g, x, y, dir) {
  g.fillStyle = theme.arrow; g.beginPath();
  g.moveTo(x, y); g.lineTo(x + dir * 8, y - 4); g.lineTo(x + dir * 8, y + 4); g.fill();
}
function arrowV(g, x, y, dir) {
  g.fillStyle = theme.arrow; g.beginPath();
  g.moveTo(x, y); g.lineTo(x - 4, y + dir * 8); g.lineTo(x + 4, y + dir * 8); g.fill();
}
function tick(g, x, y, horizontal) {
  g.strokeStyle = theme.tick; g.lineWidth = 1; g.beginPath();
  if (horizontal) { g.moveTo(x, y - 6); g.lineTo(x, y + 6); }
  else { g.moveTo(x - 6, y); g.lineTo(x + 6, y); }
  g.stroke();
}

// ---------- Otimizar medidas ----------
// Analisa as dimensões de todas as peças e iguala valores próximos (dentro de
// uma tolerância) para criar mais peças de mesmo tamanho — melhora o
// aproveitamento e simplifica o plano de corte. Largura e altura são tratadas
// de forma independente.
function clusterValues(values, tol) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  const map = {};
  let i = 0;
  while (i < uniq.length) {
    let j = i;
    const start = uniq[i];
    while (j + 1 < uniq.length && uniq[j + 1] - start <= tol) j++;   // limita o grupo a 'tol'
    const members = uniq.slice(i, j + 1);
    const mean = members.reduce((a, b) => a + b, 0) / members.length;
    const rep = Math.round(mean * 2) / 2;   // representante arredondado a 0,5 cm
    for (const m of members) map[m] = rep;
    i = j + 1;
  }
  return map;
}

function optimizePieces() {
  const dims = state.pieces.map(p => ({ p, d: pieceDims(p) })).filter(x => x.d.w != null && x.d.h != null);
  if (!dims.length) { alert('Nenhuma peça com medida definida. Calibre a escala ou use medidas manuais.'); return; }

  const ans = prompt('Otimizar medidas — tolerância máxima em cm.\nPeças com largura/altura dentro dessa diferença passam a ter a mesma medida.', '1');
  if (ans == null) return;
  const tol = parseFloat(String(ans).replace(',', '.'));
  if (!(tol >= 0)) { alert('Tolerância inválida.'); return; }

  const wMap = clusterValues(dims.map(x => x.d.w), tol);
  const hMap = clusterValues(dims.map(x => x.d.h), tol);

  let changed = 0;
  for (const { p, d } of dims) {
    const nw = wMap[d.w] ?? d.w, nh = hMap[d.h] ?? d.h;
    if (nw !== d.w || nh !== d.h) changed++;
    if (state.pxPerCm) {
      p.w = Math.max(2, nw * state.pxPerCm);
      p.h = Math.max(2, nh * state.pxPerCm);
      if (p.manual) { p.realW = nw; p.realH = nh; }
    } else {
      p.manual = true; p.realW = nw; p.realH = nh;
    }
  }

  const wSizes = new Set(Object.values(wMap)).size, hSizes = new Set(Object.values(hMap)).size;
  render(); renderPieceList(); syncProps(); scheduleSave();
  alert(`Otimização concluída.\n${changed} peça(s) ajustada(s).\nLarguras distintas: ${wSizes} · Alturas distintas: ${hSizes}.`);
}

// ---------- Projeto / Init ----------
function getProjectIdFromUrl() {
  const m = location.pathname.match(/^\/p\/([0-9a-f-]+)$/i);
  return m ? m[1] : null;
}

async function initProject() {
  const id = getProjectIdFromUrl();
  if (!id) { location.href = '/'; return; }   // sem projeto: volta para a lista
  state.projectId = id;
  setSaveStatus('saving');
  try {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) throw new Error('not found');
    const proj = await r.json();
    state.projectName = proj.name || 'Projeto';
    const nameEl = F('projName'); if (nameEl) nameEl.value = state.projectName;
    document.title = `${state.projectName} — CortaCerto`;
    if (proj.data) loadProject(proj.data, { save: false });
    setSaveStatus('saved');
  } catch {
    alert('Projeto não encontrado.');
    location.href = '/';
  }
}

window.addEventListener('resize', resizeCanvas);
document.getElementById('btnOptimize').addEventListener('click', optimizePieces);
document.getElementById('btnDeleteAll').addEventListener('click', deleteAllPieces);
bindProps();
setTool('select');
resizeCanvas();
initProject();
