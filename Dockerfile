FROM node:22.23.1-bullseye-slim AS build

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:production

FROM node:22.23.1-bullseye-slim

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /usr/src/app

RUN npm install -g http-server@14.1.1 \
  && mkdir -p /usr/src/app/dist \
  && chgrp -R 0 /usr/local/lib /usr/local/bin \
  && chmod -R g+rwX /usr/local/lib /usr/local/bin

COPY --from=build /usr/src/app/dist/citizen-webapp/browser /usr/src/app/dist/citizen-webapp/browser

RUN chgrp -R 0 /usr/src/app \
  && chmod -R g+rwX /usr/src/app

EXPOSE 8080

CMD ["http-server", "-p", "8080", "-c-1", "-P", "http://127.0.0.1:8080?", "/usr/src/app/dist/citizen-webapp/browser"]
