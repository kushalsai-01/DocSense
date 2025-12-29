package chunk

import (
	"strings"

	uuid "github.com/google/uuid"
)

type Chunk struct {
	DocumentID uuid.UUID
	Index      int
	Content    string
	TokenCount int
}

// ChunkText deterministically splits text into overlapping chunks.
// Approx 700 tokens per chunk, 100-token overlap, using words as token approximation.
func ChunkText(documentID uuid.UUID, text string) ([]Chunk, error) {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil, nil
	}

	const chunkSize = 700
	const overlap = 100

	var chunks []Chunk
	idx := 0
	for start := 0; start < len(words); start += (chunkSize - overlap) {
		end := start + chunkSize
		if end > len(words) {
			end = len(words)
		}
		slice := words[start:end]
		content := strings.Join(slice, " ")
		chunks = append(chunks, Chunk{
			DocumentID: documentID,
			Index:      idx,
			Content:    content,
			TokenCount: len(slice),
		})
		idx++
		if end == len(words) {
			break
		}
	}
	return chunks, nil
}
