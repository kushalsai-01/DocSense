package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type AppConfig struct {
	Env string
}

type HTTPConfig struct {
	Port int
}

type PostgresConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string

	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

type StorageConfig struct {
	// Dir is the root directory for locally stored uploads.
	// In Docker, this should be a mounted volume (e.g., /data).
	Dir string

	// MaxUploadBytes is the maximum allowed upload size in bytes.
	MaxUploadBytes int64
}

type RAGConfig struct {
	// BaseURL is the base URL of the RAG service (e.g., "http://rag:8000")
	BaseURL string

	// Timeout is the HTTP client timeout for RAG service calls
	Timeout time.Duration
}

type Config struct {
	App      AppConfig
	HTTP     HTTPConfig
	Postgres PostgresConfig
	Storage  StorageConfig
	RAG      RAGConfig
}

// LoadFromEnv loads configuration purely from environment variables.
//
// It provides conservative defaults suitable for local Docker-based dev.
func LoadFromEnv() (Config, error) {
	cfg := Config{}

	cfg.App.Env = getenvDefault("APP_ENV", "development")
	cfg.HTTP.Port = getenvIntDefault("HTTP_PORT", 8080)

	cfg.Postgres.Host = getenvDefault("DB_HOST", "postgres")
	cfg.Postgres.Port = getenvIntDefault("DB_PORT", 5432)
	cfg.Postgres.User = getenvDefault("DB_USER", "docsense")
	cfg.Postgres.Password = getenvDefault("DB_PASSWORD", "docsense_dev_password")
	cfg.Postgres.DBName = getenvDefault("DB_NAME", "docsense")
	cfg.Postgres.SSLMode = getenvDefault("DB_SSLMODE", "disable")

	cfg.Postgres.MaxOpenConns = getenvIntDefault("DB_MAX_OPEN_CONNS", 25)
	cfg.Postgres.MaxIdleConns = getenvIntDefault("DB_MAX_IDLE_CONNS", 25)
	cfg.Postgres.ConnMaxLifetime = getenvDurationDefault("DB_CONN_MAX_LIFETIME", 30*time.Minute)
	cfg.Postgres.ConnMaxIdleTime = getenvDurationDefault("DB_CONN_MAX_IDLE_TIME", 5*time.Minute)

	cfg.Storage.Dir = getenvDefault("STORAGE_DIR", "/data")
	cfg.Storage.MaxUploadBytes = getenvInt64Default("MAX_UPLOAD_BYTES", 25<<20) // 25 MiB

	cfg.RAG.BaseURL = getenvDefault("RAG_SERVICE_URL", "http://rag:8000")
	cfg.RAG.Timeout = getenvDurationDefault("RAG_SERVICE_TIMEOUT", 60*time.Second)

	if cfg.HTTP.Port <= 0 {
		return Config{}, fmt.Errorf("invalid HTTP_PORT: %d", cfg.HTTP.Port)
	}
	if cfg.Postgres.Host == "" {
		return Config{}, fmt.Errorf("DB_HOST is required")
	}
	if cfg.Postgres.Port <= 0 {
		return Config{}, fmt.Errorf("invalid DB_PORT: %d", cfg.Postgres.Port)
	}
	if cfg.Postgres.User == "" {
		return Config{}, fmt.Errorf("DB_USER is required")
	}
	if cfg.Postgres.DBName == "" {
		return Config{}, fmt.Errorf("DB_NAME is required")
	}
	if cfg.Storage.Dir == "" {
		return Config{}, fmt.Errorf("STORAGE_DIR is required")
	}
	if cfg.Storage.MaxUploadBytes <= 0 {
		return Config{}, fmt.Errorf("invalid MAX_UPLOAD_BYTES: %d", cfg.Storage.MaxUploadBytes)
	}
	if cfg.RAG.BaseURL == "" {
		return Config{}, fmt.Errorf("RAG_SERVICE_URL is required")
	}

	return cfg, nil
}

func getenvDefault(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return def
}

func getenvIntDefault(key string, def int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvDurationDefault(key string, def time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

func getenvInt64Default(key string, def int64) int64 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def
	}
	return n
}
