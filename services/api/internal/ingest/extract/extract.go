package extract

import (
	"bytes"
	"fmt"
	"io"
	"os"

	pdf "github.com/ledongthuc/pdf"
)

// ExtractText reads plain text from supported file types.
func ExtractText(filePath string, mimeType string) (string, error) {
	switch mimeType {
	case "application/pdf":
		// Use ledongthuc/pdf to extract plain text from PDF.
		f, r, err := pdf.Open(filePath)
		if err != nil {
			return "", fmt.Errorf("pdf open: %w", err)
		}
		defer f.Close()

		// r.GetPlainText returns an io.Reader; read it into a string.
		pr, err := r.GetPlainText()
		if err != nil {
			return "", fmt.Errorf("pdf get plain text reader: %w", err)
		}
		b, err := io.ReadAll(pr)
		if err != nil {
			return "", fmt.Errorf("pdf extract: %w", err)
		}
		return string(b), nil

	case "text/plain":
		// Read file content directly.
		f, err := os.Open(filePath)
		if err != nil {
			return "", fmt.Errorf("open text file: %w", err)
		}
		defer f.Close()
		var buf bytes.Buffer
		if _, err := io.Copy(&buf, f); err != nil {
			return "", fmt.Errorf("read text file: %w", err)
		}
		return buf.String(), nil

	default:
		return "", fmt.Errorf("unsupported mime type: %s", mimeType)
	}
}
