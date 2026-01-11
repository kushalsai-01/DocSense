package app

import (
	"strings"
	"unicode/utf8"
)

// SanitizeQuery sanitizes user query input to prevent injection attacks.
//
// This is a basic implementation. For production, consider:
// - More sophisticated prompt injection detection
// - Rate limiting per user
// - Content filtering
func SanitizeQuery(query string) (string, bool) {
	// Check for valid UTF-8
	if !utf8.ValidString(query) {
		return "", false
	}

	// Trim whitespace
	query = strings.TrimSpace(query)

	// Check minimum/maximum length
	if len(query) < 1 {
		return "", false
	}
	if len(query) > 5000 { // Reasonable max query length
		return "", false
	}

	// Remove null bytes
	query = strings.ReplaceAll(query, "\x00", "")

	// Basic prompt injection patterns (simple detection)
	// In production, use more sophisticated detection
	injectionPatterns := []string{
		"ignore previous instructions",
		"forget everything",
		"system:",
		"system prompt:",
		"# system",
		"you are now",
		"act as if",
	}

	lowerQuery := strings.ToLower(query)
	for _, pattern := range injectionPatterns {
		if strings.Contains(lowerQuery, pattern) {
			// Log suspicious activity but don't necessarily block
			// In production, you might want to block or flag these
			return query, false // Flag as suspicious
		}
	}

	return query, true
}

// ValidateDocumentFilename validates and sanitizes document filenames.
func ValidateDocumentFilename(filename string) string {
	// Remove path separators
	filename = strings.ReplaceAll(filename, "/", "_")
	filename = strings.ReplaceAll(filename, "\\", "_")
	filename = strings.ReplaceAll(filename, "..", "_")

	// Remove null bytes
	filename = strings.ReplaceAll(filename, "\x00", "")

	// Trim and limit length
	filename = strings.TrimSpace(filename)
	if len(filename) > 255 {
		filename = filename[:255]
	}

	if filename == "" {
		return "document"
	}

	return filename
}
