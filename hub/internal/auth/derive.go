package auth

import (
	"crypto/hmac"
	"crypto/sha256"
)

func Derive(key []byte, purpose string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(purpose))
	return m.Sum(nil)
}

const PurposeIngest = "history-ingest"
