/* Página de listagem de projetos (rota /). */
'use strict';

const listEl = document.getElementById('projList');
const emptyEl = document.getElementById('emptyProjects');

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR'); } catch { return '—'; }
}

async function loadList() {
  let items = [];
  try {
    const r = await fetch('/api/projects');
    items = await r.json();
  } catch {
    listEl.innerHTML = '<li class="project-error">Não foi possível carregar os projetos.</li>';
    return;
  }
  listEl.innerHTML = '';
  emptyEl.hidden = items.length > 0;
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'project-card';

    const a = document.createElement('a');
    a.className = 'pc-main';
    a.href = `/p/${it.id}`;
    const name = document.createElement('div');
    name.className = 'pc-name';
    name.textContent = it.name || 'Sem nome';
    const meta = document.createElement('div');
    meta.className = 'pc-meta';
    meta.textContent = `${it.pieces} peça(s)${it.hasImage ? ' · com imagem' : ''} · ${fmtDate(it.updatedAt)}`;
    a.append(name, meta);

    const del = document.createElement('button');
    del.className = 'btn danger pc-del';
    del.textContent = '🗑';
    del.title = 'Excluir projeto';
    del.addEventListener('click', async (e) => {
      e.preventDefault();
      const ok = await uiConfirm(`Excluir o projeto "${it.name || 'Sem nome'}"? Esta ação não pode ser desfeita.`,
        { title: 'Excluir projeto', okLabel: 'Excluir', danger: true });
      if (!ok) return;
      await fetch(`/api/projects/${it.id}`, { method: 'DELETE' });
      loadList();
    });

    li.append(a, del);
    listEl.appendChild(li);
  }
}

async function newProject() {
  const name = await uiPrompt('Nome do novo projeto:', { title: 'Novo projeto', default: 'Novo projeto' });
  if (name === null) return;
  try {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'Novo projeto' }),
    });
    const proj = await r.json();
    location.href = `/p/${proj.id}`;
  } catch { uiAlert('Não foi possível criar o projeto.'); }
}

document.getElementById('btnNew').addEventListener('click', newProject);

// Barra de menus (somente os itens aplicáveis à listagem ficam ativos)
applyShortcutLabels();
setupMenubar();
populateRecent();
const onMenu = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
onMenu('miNew', newProject);
onMenu('miNewWindow', () => window.open('/', '_blank'));
onMenu('miCutplan', () => { location.href = '/corte'; });
onMenu('miAbout', () => { location.href = '/sobre'; });

// modo online: avisa que os projetos são temporários e públicos
appConfig().then(cfg => { if (cfg && cfg.online) { const el = document.getElementById('onlineNotice'); if (el) el.hidden = false; } });

loadList();
