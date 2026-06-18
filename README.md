# 🪵 CortaCerto

**CortaCerto** é um web app **auto-hospedado** (Docker) para marcenaria: você mapeia
o tamanho das peças sobre uma **foto de referência**, organiza tudo em **projetos**
salvos localmente e gera um **plano de corte otimizado** das chapas de madeira —
minimizando desperdício e com cortes guilhotinados válidos para seccionadora.

Tudo roda na sua máquina. O editor é HTML/CSS/JS puro no navegador; um pequeno
servidor Node (sem dependências externas) serve o app e grava os projetos em
arquivos JSON num diretório local (`./data`). Nenhum dado sai do seu computador.

---

## 📸 Telas

### Lista de projetos
![Lista de projetos](docs/screenshots/projetos.png)

### Editor — peças sobre a foto de referência
![Editor](docs/screenshots/editor.png)

### Esquemático com as medidas
![Esquemático](docs/screenshots/esquematico.png)

### Plano de corte otimizado
![Plano de corte](docs/screenshots/plano-de-corte.png)

---

## ✨ Funcionalidades

### Projetos
- 📁 **Vários projetos**, cada um com URL própria por UUID (`/p/<uuid>`).
- 💾 **Auto-save** no servidor a cada alteração (gravado em `./data/<uuid>.json`).
- ⬇ **Exportar / 📂 Abrir** projeto em `.json` (backup, com a imagem embutida).

### Editor de peças
- 📷 Carregar uma **imagem de fundo** (foto do painel/móvel).
- 📏 **Calibrar a escala**: arraste sobre uma medida conhecida e informe os cm — o
  app converte px → cm automaticamente.
- ✂ **Recortar (crop)** a imagem (peças e calibração são reposicionadas sozinhas).
- ▭ **Desenhar peças** como retângulos: mover, redimensionar (8 alças), nomear e
  colorir. A ferramenta "Peça" permanece ativa para desenhar várias em sequência.
- 🎨 Cada peça tem rótulo (D1, D2…), nome da cor, cor da borda e medidas (auto ou
  manuais).
- ↕ **Reordenar peças** por **arrastar e soltar** (também controla a sobreposição).
- ⬍ Botões de **camada** (frente/trás) e 📐 **arredondar para 0,5 cm**.
- ✨ **Otimizar**: analisa as medidas de todas as peças e **iguala valores
  próximos** (dentro de uma tolerância) para reaproveitar melhor a chapa.
- 🗑 **Limpar**: excluir todas as peças de uma vez.

### Saídas
- 📐 **Esquemático** com cotas totais + medidas individuais; exporta **PNG** e
  **PDF** (fundo branco, foto a 50% para economizar tinta).
- ✂ **Plano de corte**: escolha o tamanho da chapa, a espessura de corte (kerf) e
  selecione projetos inteiros **ou peças individuais de vários projetos**. O app
  empacota as peças em colunas, mostra o aproveitamento e exporta **PDF**.

---

## 🚀 Instalação

### Pré-requisitos
- **Docker** e **Docker Compose** instalados.

### Passo a passo

1. **Obtenha o código** (clone ou cópia da pasta):
   ```bash
   git clone https://github.com/helviojunior/corta-certo.git
   cd corta-certo
   ```

2. **Suba o container** (build + execução em segundo plano):
   ```bash
   docker compose up -d --build
   ```

3. **Acesse no navegador:**
   👉 **http://localhost:8080**

4. **Pronto.** Os projetos ficam salvos na pasta **`./data`** (criada
   automaticamente e montada como volume). Faça backup dessa pasta para preservar
   seu trabalho.

### Comandos úteis

```bash
docker compose logs -f      # acompanhar os logs
docker compose restart      # reiniciar
docker compose down         # parar e remover o container (os dados em ./data ficam)
docker compose up -d --build  # aplicar atualizações do código
```

### Mudar a porta
Edite `docker-compose.yml` (ex.: `"9000:80"`) e rode `docker compose up -d`.

### Sem Docker (desenvolvimento)
Requer Node 18+:
```bash
node server.js          # serve em http://localhost:80
PORT=8080 node server.js  # ou em outra porta
```

---

## 🧭 Como usar

### 1) Criar/abrir um projeto
- Na tela inicial (**/**) clique em **➕ Novo projeto** e dê um nome.
- A lista mostra todos os projetos (nº de peças, data); clique para abrir ou use
  🗑 para excluir.

### 2) Mapear as peças (editor)
1. **📷 Imagem** → carregue a foto do painel.
2. **📏 Calibrar** → arraste sobre algo de tamanho conhecido (régua, uma medida que
   você já sabe) e digite o valor em cm.
3. **▭ Peça** → arraste para criar cada retângulo. Ajuste pela barra lateral
   (rótulo, cor, posição). As medidas em cm aparecem sozinhas.
   - Marque **Medida manual** para digitar a largura/altura exatas.
4. (Opcional) **✨ Otimizar** → informe a tolerância (ex.: `1` cm) para igualar
   medidas próximas e facilitar o corte.
5. Tudo é salvo automaticamente (**✓ Salvo** no topo).

### 3) Gerar o esquemático
- **📐 Esquemático** → confira o desenho com as cotas e exporte em **PNG** ou
  **🖨 PDF** (otimizado para impressão).

### 4) Gerar o plano de corte
1. Na tela inicial, clique em **✂ Plano de corte** (ou acesse **/corte**).
2. Defina o **tamanho da chapa** (presets ou personalizado, em mm) e a
   **espessura de corte / kerf** (ex.: `4` mm).
3. Marque **projetos inteiros** ou expanda e selecione **peças individuais** de
   vários projetos.
4. **⚙ Gerar plano** → veja o aproveitamento por chapa e **🖨 Exportar PDF**.

> Dica: rode **✨ Otimizar** nos projetos antes — peças com a mesma largura formam
> colunas cheias e desperdiçam menos chapa.

### Atalhos de teclado (editor)

| Tecla | Ação |
|-------|------|
| `V` | Ferramenta selecionar |
| `R` | Desenhar peça |
| `C` | Calibrar |
| `X` | Recortar imagem (Enter aplica, Esc cancela) |
| `Delete` / `Backspace` | Excluir peça selecionada |
| Setas | Mover peça (Shift = 10px) |
| `Esc` | Desmarcar |
| Roda do mouse | Zoom |
| Botão do meio / `Espaço`+arrastar | Mover a tela (pan) |

---

## 🗂️ Dados e API

Os projetos são gravados em `./data/<uuid>.json`. O servidor expõe uma API REST:

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/api/projects` | Lista os projetos |
| `POST` | `/api/projects` | Cria um projeto (gera UUID) |
| `GET`  | `/api/projects/:id` | Lê um projeto |
| `PUT`  | `/api/projects/:id` | Salva um projeto |
| `DELETE` | `/api/projects/:id` | Exclui um projeto |
| `GET`  | `/api/projects/:id/pieces` | Peças com medidas em mm (sem a imagem) |

### Formato do projeto (`data`)

```jsonc
{
  "version": 1,
  "image": { "dataUrl": "data:image/...", "name": "foto.jpg", "width": 1200, "height": 1100 },
  "scale": { "pxPerCm": 12.4, "refLine": { "x1": 0, "y1": 0, "x2": 0, "y2": 0, "cm": 30 } },
  "total": { "widthCm": 80, "heightCm": 110 },
  "options": { "snapHalf": true },
  "pieces": [
    { "id": 1, "label": "D1", "colorName": "Verde", "color": "#84cc16",
      "x": 120, "y": 80, "w": 300, "h": 350,
      "manual": false, "realW": null, "realH": null }
  ]
}
```

As coordenadas `x,y,w,h` das peças estão em **pixels da imagem original**, então o
projeto é independente do zoom/tamanho da tela.

---

## 📝 Notas

- O número de cortes e o comprimento de corte no plano são **estimativas**.
- O empacotamento é uma heurística (colunas guilhotinadas) — bom aproveitamento e
  cortes válidos para seccionadora, mas não garante o ótimo absoluto.
