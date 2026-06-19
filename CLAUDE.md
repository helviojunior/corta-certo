# CortaCerto — instruções do projeto

## Versionamento (bump obrigatório a cada commit)
- A versão do app fica em **`src/version.js`** (`const APP_VERSION`), fonte única exibida no cabeçalho como `vX`.
- **A cada bump/commit, incremente +1 o contador após o `0.`** — a parte fracionária é um contador inteiro:
  `0.1 → 0.2 → … → 0.9 → 0.10 → 0.11 → … → 0.999`.
- **Limite máximo: `0.999`** (999 commits). Não ultrapassar sem orientação do usuário.
- Só é necessário editar `src/version.js`; o cabeçalho de todas as páginas (`.app-version`) é atualizado automaticamente.

## Diálogos
- Não usar `alert`/`confirm`/`prompt` nativos do navegador. Usar os diálogos customizados
  `uiAlert` / `uiConfirm` / `uiPrompt` (baseados em Promise) definidos em **`src/dialog.js`**.
