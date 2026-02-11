# Build stage
FROM golang:1.24-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api

# Runtime stage — Alpine for health check support (wget)
FROM alpine:3.20

RUN apk add --no-cache wget ca-certificates

WORKDIR /
COPY --from=build /out/api /api

# Ensure the default upload directory exists (volume-mounted in compose).
RUN mkdir -p /data

EXPOSE 8080

ENTRYPOINT ["/api"]
