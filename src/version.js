/* CortaCerto — versão do app (fonte única).
   Regra de bump: a cada commit, incremente +1 o contador após "0." (1, 2, … 999),
   indo no máximo até 0.999. Ex.: 0.1 → 0.2 → … → 0.9 → 0.10 → … → 0.999. */
'use strict';

const APP_VERSION = '0.4';

(function () {
  const apply = () => document.querySelectorAll('.app-version')
    .forEach(el => { el.textContent = 'v' + APP_VERSION; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
