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

	if !bytes.Equal(ingest, Derive(key, PurposeIngest)) {
		t.Error("Derive is not deterministic")
	}

	if _, err := NewSigner(ingest); err != nil {
		t.Errorf("the derived key cannot sign: %v", err)
	}
}
