/* CortaCerto — diálogos customizados (substituem alert/confirm/prompt nativos).
   Exposto globalmente como uiAlert / uiConfirm / uiPrompt, todos baseados em
   Promise. Sem dependências; cria o overlay sob demanda no <body>. */
'use strict';

(function () {
  let overlay, box, titleEl, msgEl, inputEl, okBtn, cancelBtn;
  let current = null;   // { resolve, type }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'modal dialog';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">' +
        '<h2 id="dlgTitle" class="dialog-title"></h2>' +
        '<p class="dialog-msg"></p>' +
        '<input class="dialog-input proj-name" type="text" hidden />' +
        '<div class="dialog-actions">' +
          '<button class="btn dialog-cancel" type="button">Cancelar</button>' +
          '<button class="btn dialog-ok" type="button">OK</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    box = overlay.querySelector('.dialog-box');
    titleEl = overlay.querySelector('.dialog-title');
    msgEl = overlay.querySelector('.dialog-msg');
    inputEl = overlay.querySelector('.dialog-input');
    okBtn = overlay.querySelector('.dialog-ok');
    cancelBtn = overlay.querySelector('.dialog-cancel');

    okBtn.addEventListener('click', () => close(true));
    cancelBtn.addEventListener('click', () => close(false));
    // clicar fora cancela
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(false); });
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); close(true); } });
  }

  function onKey(e) {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'Enter' && current.type !== 'prompt') { e.preventDefault(); close(true); }
  }

  function close(ok) {
    if (!current) return;
    const { resolve, type } = current;
    current = null;
    overlay.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (type === 'alert') resolve();
    else if (type === 'confirm') resolve(ok);
    else resolve(ok ? inputEl.value : null);   // prompt
  }

  function open(type, message, opts) {
    if (!overlay) build();
    opts = opts || {};
    return new Promise(resolve => {
      // se já houver um diálogo aberto, descarta-o (cancela) antes de abrir o novo
      if (current) close(false);
      current = { resolve, type };

      titleEl.textContent = opts.title || defaultTitle(type);
      titleEl.hidden = !titleEl.textContent;
      if (opts.html) msgEl.innerHTML = opts.html;       // conteúdo confiável (estático do app)
      else msgEl.textContent = message || '';
      msgEl.hidden = !message && !opts.html;

      const isPrompt = type === 'prompt';
      inputEl.hidden = !isPrompt;
      if (isPrompt) {
        inputEl.value = opts.default != null ? String(opts.default) : '';
        inputEl.placeholder = opts.placeholder || '';
      }

      cancelBtn.hidden = (type === 'alert');
      okBtn.textContent = opts.okLabel || (type === 'alert' ? 'OK' : (isPrompt ? 'Confirmar' : 'OK'));
      cancelBtn.textContent = opts.cancelLabel || 'Cancelar';
      okBtn.classList.toggle('danger', !!opts.danger);

      overlay.hidden = false;
      document.addEventListener('keydown', onKey, true);
      // foco: input no prompt, senão no botão principal
      setTimeout(() => { (isPrompt ? inputEl : okBtn).focus(); if (isPrompt) inputEl.select(); }, 0);
    });
  }

  function defaultTitle(type) {
    return type === 'confirm' ? 'Confirmar' : (type === 'prompt' ? '' : 'Aviso');
  }

  // API pública
  window.uiAlert = (message, opts) => open('alert', message, opts);
  window.uiConfirm = (message, opts) => open('confirm', message, opts);
  window.uiPrompt = (message, opts) => open('prompt', message, opts);
})();
