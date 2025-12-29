package documents

import "github.com/gin-gonic/gin"

// RegisterRoutes wires the documents HTTP routes.
//
// Upload behavior is implemented for local storage + metadata persistence.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	docs := rg.Group("/documents")
	docs.POST("/upload", h.Upload)
	docs.GET("", h.List)
}
