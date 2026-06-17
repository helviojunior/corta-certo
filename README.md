# 🪵 Mapa de Peças de Madeira

Web app **auto-hospedado** (Docker) para desenhar e mapear o tamanho de peças de
madeira sobre uma foto de referência, salvar tudo em **JSON** (imagem de fundo +
coordenadas) e gerar um **esquemático com as medidas** das peças.

Tudo roda no navegador (HTML/CSS/JS puro) — nenhum dado sai da sua máquina. O
Docker apenas serve os arquivos estáticos com nginx.

## ✨ Funcionalidades

- 📷 Carregar uma imagem de fundo (foto do painel).
- 📏 **Calibrar a escala**: arraste sobre uma medida conhecida e informe quantos cm — o app passa a converter px → cm automaticamente (a linha de referência some após calibrar).
- ✂ **Recortar (crop)** a imagem: as peças e a calibração são reposicionadas automaticamente.
- ▭ **Desenhar peças** como retângulos, mover, redimensionar (8 alças), nomear e colorir.
- 🎨 Cada peça tem rótulo (D1, D2…), nome da cor, cor da borda e medidas (auto ou manuais).
- ⬍ **Ordenar camadas** das peças (frente/trás) para controlar a sobreposição.
- 📐 **Arredondar para 0,5 cm** (opcional) as medidas calculadas.
- 💾 **Salvar projeto** em `.json` com a imagem original embutida (base64) + todas as coordenadas e medidas.
- 📂 **Abrir projeto** de volta exatamente como estava.
- 📐 **Gerar esquemático** (layout com cotas totais + medidas individuais de cada peça) e exportar como **PNG**.

## 🚀 Como rodar

### Docker Compose (recomendado)

```bash
docker compose up -d --build
```

Acesse: **http://localhost:8080**

### Docker direto

```bash
docker build -t draw-wood .
docker run -d -p 8080:80 --name draw-wood draw-wood
```

### Sem Docker (teste rápido)

```bash
cd src && python3 -m http.server 8080
```

## 🧭 Fluxo de uso

1. **📷 Imagem** → carregue a foto do painel.
2. **📏 Calibrar** → arraste sobre algo de tamanho conhecido (uma régua, a largura
   de uma peça que você já sabe) e digite o valor em cm.
3. **▭ Peça** → arraste para criar cada retângulo. Ajuste pela barra lateral
   (rótulo, cor, posição). As medidas em cm aparecem sozinhas.
   - Marque **Medida manual** para digitar a largura/altura exatas de uma peça.
4. Preencha (opcional) **Largura/Altura total** se quiser sobrescrever o cálculo automático.
5. **📐 Esquemático** → confira o desenho técnico e **⬇ Exportar PNG**.
6. **💾 Salvar** → baixa o `.json`. Use **📂 Abrir** para retomar depois.

### Atalhos de teclado

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

## 📦 Formato do JSON

```jsonc
{
  "version": 1,
  "image": { "dataUrl": "data:image/...", "name": "foto.jpg", "width": 1200, "height": 1100 },
  "scale": { "pxPerCm": 12.4, "refLine": { "x1": 0, "y1": 0, "x2": 0, "y2": 0, "cm": 30 } },
  "total": { "widthCm": 80, "heightCm": 110 },
  "pieces": [
    { "id": 1, "label": "D1", "colorName": "Verde", "color": "#84cc16",
      "x": 120, "y": 80, "w": 300, "h": 350,
      "manual": false, "realW": null, "realH": null }
  ]
}
```

As coordenadas `x,y,w,h` das peças estão em **pixels da imagem original**, então o
projeto é independente do zoom/tamanho da tela.
