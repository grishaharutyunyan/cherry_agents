FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY knowledge ./knowledge

# TODO(M3/M5): this image has no git or `gh` CLI yet, and GAME_BACKEND_PATH/GAME_FRONTEND_PATH
# point nowhere by default — fine for M2 (design phase only reads/writes local files, no git
# operations). Once the backend/frontend builder phases land (M3) and finalize starts pushing +
# opening PRs (M5), this image needs: git + gh installed, credentials provisioned (see README.md),
# and either a mounted volume with working clones of game_backend/game-frontend or an entrypoint
# script that clones them fresh on container start using GAME_BACKEND_REPO/GAME_FRONTEND_REPO.

CMD ["node", "dist/main.js"]
