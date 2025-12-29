package middleware

import (
	"regexp"

	"github.com/gin-gonic/gin"
)

const userIDHeader = "X-User-Id"

const devAuthKey = "dev_auth"

// DefaultDevUserID is used when no X-User-Id header is present.
// It must be a valid UUID because the Postgres schema stores user IDs as uuid.
const DefaultDevUserID = "00000000-0000-0000-0000-000000000001"

var uuidLike = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func IsDevAuth(c *gin.Context) bool {
	v, ok := c.Get(devAuthKey)
	if !ok {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}

// DevAuth is a minimal development helper.
//
// If no authenticated user is present in context, it sets one based on the
// X-User-Id header (or a fixed fallback). This keeps the upload endpoint usable
// in local/dev environments without implementing full auth.
func DevAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := GetAuthenticatedUserID(c); ok {
			c.Next()
			return
		}

		id := c.GetHeader(userIDHeader)
		if id == "" || !uuidLike.MatchString(id) {
			id = DefaultDevUserID
		}

		c.Set(devAuthKey, true)
		c.Set(authenticatedUserIDKey, id)
		c.Next()
	}
}
