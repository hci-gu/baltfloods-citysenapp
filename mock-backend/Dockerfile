FROM --platform=$BUILDPLATFORM golang:1.24.11-alpine AS build

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY ./*.go ./
COPY ./migrations ./migrations
COPY ./demo ./demo
COPY ./sensordemo ./sensordemo

RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
  go build -trimpath -ldflags="-s -w" -o /out/app .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
  && mkdir -p /pb/pb_data \
  && chgrp -R 0 /pb \
  && chmod -R g+rwX /pb

WORKDIR /pb

COPY --from=build /out/app /pb/app
COPY ./pb_public /pb/pb_public

EXPOSE 8080

CMD ["/pb/app", "serve", "--http=0.0.0.0:8080"]
