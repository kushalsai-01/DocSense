package app

import (
	"context"
	"log"
	"os"
)

// Logger provides structured logging capabilities.
// In production, consider using a proper logging library (zap, logrus, etc.)
type Logger struct {
	*log.Logger
}

// NewLogger creates a new logger instance.
func NewLogger() *Logger {
	return &Logger{
		Logger: log.New(os.Stdout, "[DocSense] ", log.LstdFlags|log.Lmicroseconds),
	}
}

// WithRequestID creates a logger with request ID context.
func (l *Logger) WithRequestID(ctx context.Context, requestID string) *Logger {
	// In production, use structured logging with fields
	prefix := "[DocSense] [" + requestID + "] "
	return &Logger{
		Logger: log.New(os.Stdout, prefix, log.LstdFlags|log.Lmicroseconds),
	}
}

// LogError logs an error with context.
func (l *Logger) LogError(ctx context.Context, err error, msg string) {
	l.Printf("ERROR: %s: %v", msg, err)
}

// LogInfo logs an info message with context.
func (l *Logger) LogInfo(ctx context.Context, msg string, args ...interface{}) {
	l.Printf("INFO: "+msg, args...)
}

// LogDebug logs a debug message (only in development).
func (l *Logger) LogDebug(ctx context.Context, msg string, args ...interface{}) {
	// In production, check log level
	l.Printf("DEBUG: "+msg, args...)
}
