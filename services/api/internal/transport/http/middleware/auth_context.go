package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const authenticatedUserIDKey = "user_id"

// GetAuthenticatedUserID retrieves the authenticated user ID from Gin context.
//
// Assumption: an authentication middleware has already validated the request and
// stored the user id under the key "user_id".
//
// This package does not implement authentication itself.
func GetAuthenticatedUserID(c *gin.Context) (string, bool) {
	v, ok := c.Get(authenticatedUserIDKey)
	if !ok {
		return "", false
	}
	id, ok := v.(string)
	if !ok || id == "" {
		return "", false
	}
	return id, true
}

// AbortUnauthorized standardizes 401 responses.
func AbortUnauthorized(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
}
