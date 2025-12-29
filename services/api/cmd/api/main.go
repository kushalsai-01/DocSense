package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"docsense/api/internal/adapters/config"
	"docsense/api/internal/adapters/postgres"
	"docsense/api/internal/transport/http/auth"
	"docsense/api/internal/transport/http/documents"
	"docsense/api/internal/transport/http/middleware"
	"docsense/api/internal/transport/http/users"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	db, err := postgres.Open(cfg)
	if err != nil {
		log.Fatalf("db error: %v", err)
	}
	defer func() {
		_ = db.Close()
	}()

	router := gin.New()
	// Keep multipart parsing bounded; actual upload limit is enforced per-request.
	router.MaxMultipartMemory = 8 << 20
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(middleware.RequestID())
	if cfg.App.Env != "production" {
		router.Use(middleware.DevAuth())
	}

	api := router.Group("/api")
	auth.RegisterRoutes(api)
	users.RegisterRoutes(api)
	documents.NewHandler(db, cfg.Storage.Dir, cfg.Storage.MaxUploadBytes).RegisterRoutes(api)

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.HTTP.Port),
		Handler:           router,
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("backend-go listening on %s (env=%s)", srv.Addr, cfg.App.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server error: %v", err)
		}
	}()

	<-shutdownCtx.Done()
	log.Printf("shutdown signal received")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("http shutdown error: %v", err)
	}

	drainDB(ctx, db)
	log.Printf("shutdown complete")
}

func drainDB(ctx context.Context, db *sql.DB) {
	// Best-effort: close idle connections and stop accepting new ones.
	// Any in-flight queries should complete before the server exits.
	db.SetConnMaxLifetime(1 * time.Nanosecond)
	db.SetConnMaxIdleTime(1 * time.Nanosecond)
	// Give the DB pool a moment to observe the new limits.
	select {
	case <-time.After(250 * time.Millisecond):
	case <-ctx.Done():
	}
}
