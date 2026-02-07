package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CORS adds permissive CORS headers for local development.
//
// In production this middleware should NOT be used — the reverse proxy or
// gateway handles CORS instead.
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, X-User-Id, X-Request-Id")
		c.Header("Access-Control-Max-Age", "3600")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
