package auth

import (
	"bytes"
	"strings"
	"testing"
)

func TestDeriveSeparatesPurposes(t *testing.T) {
	key := []byte(strings.Repeat("k", 32))

	ingest := Derive(key, PurposeIngest)
	other := Derive(key, "something-else")

	if bytes.Equal(ingest, key) {
		t.Error("the derived key is the configured key; a ticket would be a cookie")
	}
	if bytes.Equal(ingest, other) {
		t.Error("two purposes derived the same key")
	}
	// Deterministic, or every hub restart would invalidate every ticket
	// still held by a running Pod.
	if !bytes.Equal(ingest, Derive(key, PurposeIngest)) {
		t.Error("Derive is not deterministic")
	}
	// Long enough for NewSigner, which refuses anything shorter — a
	// derived key that could not be used would be found at the first
	// login, in production.
	if _, err := NewSigner(ingest); err != nil {
		t.Errorf("the derived key cannot sign: %v", err)
	}
}
