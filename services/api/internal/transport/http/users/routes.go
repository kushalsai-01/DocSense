package users

import "github.com/gin-gonic/gin"

// RegisterRoutes wires the users HTTP routes.
//
// Placeholder only (no business logic yet).
func RegisterRoutes(rg *gin.RouterGroup) {
	_ = rg.Group("/users")
}
