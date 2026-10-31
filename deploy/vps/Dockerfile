# Climb (SEO Studio) for the CreativHeads VPS. Built the same way Vercel builds it: npm ci, npm run build.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/node-server.mjs"]
