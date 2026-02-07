# Build stage
FROM golang:1.24-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api

# Runtime stage
FROM gcr.io/distroless/static

WORKDIR /
COPY --from=build /out/api /api

# Ensure the default upload directory exists (volume-mounted in compose).
COPY --from=build /src/data /data

EXPOSE 8080

ENTRYPOINT ["/api"]
