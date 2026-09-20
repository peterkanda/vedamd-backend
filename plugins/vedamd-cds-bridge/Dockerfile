# Minimal, dependency-free runtime image.
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

# Run unprivileged — the bridge needs no filesystem or root access.
USER node

ENV PORT=8088 HOST=0.0.0.0
EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8088)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
