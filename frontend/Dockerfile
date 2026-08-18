FROM node:20-slim AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build:web

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/server.js .
RUN npm install serve-handler
COPY --from=build /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD node server.js
