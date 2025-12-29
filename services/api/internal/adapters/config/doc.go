// Package config loads environment-based settings and constructs infrastructure
// wiring inputs (e.g., DSNs).
//
// Responsibilities:
// - Parse and validate environment variables
// - Provide strongly-typed configuration structs
// - Helpers to open external resources (DB connections) using settings
package config
