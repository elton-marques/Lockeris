FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @armarios/contracts && npm run build -w @armarios/api
RUN npm prune --omit=dev
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["sh", "-c", "npm run db:migrate && npm run start -w @armarios/api"]
