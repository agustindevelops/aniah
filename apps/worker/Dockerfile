FROM node:22-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/scraper/package.json packages/scraper/package.json
COPY packages/ai/package.json packages/ai/package.json
RUN npm install
COPY . .
RUN npm run build -w @local-sync/shared && npm run build -w @local-sync/db && npm run build -w @local-sync/pipeline && npm run build -w @local-sync/ai && npm run build -w @local-sync/scraper && npm run build -w @local-sync/worker
EXPOSE 4301
CMD ["npm", "run", "start", "-w", "@local-sync/worker"]
