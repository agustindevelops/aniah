FROM node:22-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "start"]
