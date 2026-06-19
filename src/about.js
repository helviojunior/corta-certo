/* Página Sobre — exibe o aviso do modo público quando o servidor está online. */
'use strict';

fetch('/api/config')
  .then(r => r.json())
  .then(cfg => { if (cfg && cfg.online) { const el = document.getElementById('onlineWarning'); if (el) el.hidden = false; } })
  .catch(() => {});
