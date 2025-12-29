# Build stage
FROM golang:1.22-alpine AS build

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

EXPOSE 8080

ENTRYPOINT ["/api"]
