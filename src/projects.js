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
      if (!confirm(`Excluir o projeto "${it.name || 'Sem nome'}"? Esta ação não pode ser desfeita.`)) return;
      await fetch(`/api/projects/${it.id}`, { method: 'DELETE' });
      loadList();
    });

    li.append(a, del);
    listEl.appendChild(li);
  }
}

document.getElementById('btnNew').addEventListener('click', async () => {
  const name = prompt('Nome do novo projeto:', 'Novo projeto');
  if (name === null) return;
  const r = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Novo projeto' }),
  });
  const proj = await r.json();
  location.href = `/p/${proj.id}`;
});

loadList();
