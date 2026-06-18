FROM node:20-alpine

WORKDIR /app

# App estático + servidor (sem dependências externas)
COPY server.js ./
COPY src/ ./src/

# Diretório de dados (normalmente sobreposto por um volume)
RUN mkdir -p /app/data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/api/projects >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
