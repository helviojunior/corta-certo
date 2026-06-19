/* CortaCerto — controlador compartilhado da barra de menus.
   Interação (abrir/fechar/submenu/atalhos) + ações comuns (Sobre, Recentes).
   Usado pelo editor (app.js) e pela lista de projetos (projects.js).
   Exposto via window.*  (carregar depois de version.js e dialog.js). */
'use strict';

// macOS → símbolos ⌘/⇧/⌥; demais → Ctrl+Shift+…
const IS_MAC = /mac|iphone|ipad/i.test(
  (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent);

function formatShortcut(sc) {
  const parts = sc.split('+');
  const has = t => parts.includes(t);
  const key = parts[parts.length - 1].toUpperCase();
  if (IS_MAC) return (has('alt') ? '⌥' : '') + (has('shift') ? '⇧' : '') + (has('mod') ? '⌘' : '') + key;
  const seg = [];
  if (has('mod')) seg.push('Ctrl');
  if (has('shift')) seg.push('Shift');
  if (has('alt')) seg.push('Alt');
  seg.push(key);
  return seg.join('+');
}

function applyShortcutLabels(root) {
  (root || document).querySelectorAll('.mi-key[data-sc]').forEach(el => { el.textContent = formatShortcut(el.dataset.sc); });
}

// Liga a interação da barra. Respeita `.menu.disabled` (menu inteiro) e
// `.menu-item.disabled` (item individual).
function setupMenubar(bar) {
  bar = bar || document.querySelector('.menubar');
  if (!bar) return null;
  let openMenu = null;
  const onDocDown = e => { if (!bar.contains(e.target)) closeMenu(); };
  function closeMenu() {
    if (!openMenu) return;
    openMenu.classList.remove('open');
    const b = openMenu.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', 'false');
    openMenu = null;
    document.removeEventListener('mousedown', onDocDown, true);
  }
  function openMenuEl(menu) {
    if (openMenu === menu) return;
    closeMenu();
    if (menu.classList.contains('disabled')) return;
    if (!menu.querySelector(':scope > .menu-pop')) return;   // sem dropdown (ex.: Sobre)
    openMenu = menu;
    menu.classList.add('open');
    const b = menu.querySelector('.menu-btn'); if (b) b.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDocDown, true);
  }
  for (const menu of bar.querySelectorAll('.menu')) {
    const btn = menu.querySelector('.menu-btn');
    const hasPop = !!menu.querySelector(':scope > .menu-pop');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (menu.classList.contains('disabled')) return;
      if (!hasPop) { closeMenu(); return; }
      (openMenu === menu) ? closeMenu() : openMenuEl(menu);
    });
    btn.addEventListener('mouseenter', () => { if (openMenu && hasPop && !menu.classList.contains('disabled')) openMenuEl(menu); });
  }
  bar.addEventListener('click', e => {
    const item = e.target.closest('.menu-item');
    if (item && !item.classList.contains('has-sub') && !item.classList.contains('disabled')) closeMenu();
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  return { close: closeMenu };
}

function showAbout() {
  const v = (typeof APP_VERSION !== 'undefined') ? 'v' + APP_VERSION : '';
  const html = `<strong>CortaCerto</strong> — marcenaria ${v}<br><br>` +
    `Mapeie peças sobre uma foto, gere o esquemático com medidas e o plano de corte de chapas.` +
    `<br><br>` +
    `<span class="dlg-row"><span class="dlg-k">Autor</span>` +
    `<a href="https://github.com/helviojunior/" target="_blank" rel="noopener noreferrer">Helvio Junior</a></span>` +
    `<span class="dlg-row"><span class="dlg-k">Projeto</span>` +
    `<a href="https://github.com/helviojunior/corta-certo" target="_blank" rel="noopener noreferrer">github.com/helviojunior/corta-certo</a></span>`;
  uiAlert('', { title: 'Sobre o CortaCerto', html });
}

// Preenche o submenu "Abrir recente". currentId destaca o projeto atual (editor).
async function populateRecent(currentId) {
  const ul = document.getElementById('recentList');
  if (!ul) return;
  let list = [];
  try { const r = await fetch('/api/projects'); if (r.ok) list = await r.json(); }
  catch { return; }
  ul.innerHTML = '';
  const items = list.slice(0, 8);
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'menu-item muted'; li.textContent = 'Nenhum projeto';
    ul.appendChild(li);
  } else {
    for (const p of items) {
      const cur = p.id === currentId;
      const li = document.createElement('li');
      li.className = 'menu-item' + (cur ? ' muted' : '');
      const ico = document.createElement('span'); ico.className = 'mi-ico'; ico.textContent = cur ? '•' : '📄';
      const lbl = document.createElement('span'); lbl.className = 'mi-lbl'; lbl.textContent = p.name || 'Sem nome';
      li.append(ico, lbl);
      if (!cur) li.addEventListener('click', () => { location.href = '/p/' + p.id; });
      ul.appendChild(li);
    }
  }
  const sep = document.createElement('li'); sep.className = 'menu-sep'; ul.appendChild(sep);
  const all = document.createElement('li'); all.className = 'menu-item';
  all.innerHTML = '<span class="mi-ico">📃</span><span class="mi-lbl">Listar todos</span>';
  all.addEventListener('click', () => { location.href = '/'; });
  ul.appendChild(all);
}

window.IS_MAC = IS_MAC;
window.formatShortcut = formatShortcut;
window.applyShortcutLabels = applyShortcutLabels;
window.setupMenubar = setupMenubar;
window.showAbout = showAbout;
window.populateRecent = populateRecent;
