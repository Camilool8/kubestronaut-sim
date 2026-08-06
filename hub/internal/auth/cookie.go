package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const minKeyLen = 32

type Session struct {
	UserID string `json:"uid"`

	Login   string `json:"login"`
	Expires int64  `json:"exp"`
}

var (
	ErrInvalidCookie = errors.New("auth: invalid session cookie")
	ErrExpired       = errors.New("auth: session expired")
)

type Signer struct {
	key []byte

	Now func() time.Time
}

func NewSigner(key []byte) (*Signer, error) {
	if len(key) < minKeyLen {
		return nil, fmt.Errorf("auth: signing key is %d bytes, need at least %d", len(key), minKeyLen)
	}
	return &Signer{key: key, Now: time.Now}, nil
}

func (s *Signer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Signer) Encode(sess Session) (string, error) {
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", fmt.Errorf("auth: encode session: %w", err)
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + base64.RawURLEncoding.EncodeToString(s.mac(body)), nil
}

func (s *Signer) Decode(v string) (Session, error) {
	body, sig, ok := strings.Cut(v, ".")
	if !ok {
		return Session{}, ErrInvalidCookie
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return Session{}, ErrInvalidCookie
	}

	if !hmac.Equal(got, s.mac(body)) {
		return Session{}, ErrInvalidCookie
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return Session{}, ErrInvalidCookie
	}
	var sess Session
	if err := json.Unmarshal(payload, &sess); err != nil {
		return Session{}, ErrInvalidCookie
	}
	if sess.UserID == "" {
		return Session{}, ErrInvalidCookie
	}
	if sess.Expires != 0 && s.now().After(time.Unix(sess.Expires, 0)) {
		return Session{}, ErrExpired
	}
	return sess, nil
}

func (s *Signer) mac(body string) []byte {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(body))
	return m.Sum(nil)
}
