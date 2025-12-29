package auth

import "github.com/gin-gonic/gin"

// RegisterRoutes wires auth-related routes.
//
// Placeholder only (no business logic yet).
func RegisterRoutes(rg *gin.RouterGroup) {
	_ = rg.Group("/auth")
}
