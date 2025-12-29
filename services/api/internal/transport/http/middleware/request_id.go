package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"github.com/gin-gonic/gin"
)

const requestIDHeader = "X-Request-Id"

// RequestID ensures every request has a stable correlation ID.
//
// This is intentionally minimal scaffolding; real deployments often integrate
// structured logging and distributed tracing.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Request.Header.Get(requestIDHeader)
		if id == "" {
			// Gin does not generate request IDs by default.
			// Keep this dependency-free: generate a random 16-byte hex ID.
			b := make([]byte, 16)
			if _, err := rand.Read(b); err == nil {
				id = hex.EncodeToString(b)
			} else {
				// Last-resort fallback.
				id = "unknown"
			}
		}
		c.Writer.Header().Set(requestIDHeader, id)
		c.Next()
	}
}
