// Package auth establishes who a request is from.
//
// The load-bearing idea of the whole hosted tier lives here: identity
// sits ABOVE the simulator. The facilitator keeps its "no authentication
// anywhere" property literally — it is simply never reachable except
// through the hub. That is what lets `./sim up` stay byte-identical with
// no accounts, no cookies and no new configuration.
//
// Stdlib only, like every other module in this repo. The signed cookie
// is a few lines of crypto/hmac rather than a JWT dependency, and the
// OAuth exchange is two HTTP POSTs rather than an OAuth library.
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

// minKeyLen is the shortest signing key this package will accept.
//
// Refused rather than stretched: a hub deployed with COOKIE_KEY=secret
// would look identical to a correct one from the outside, and the
// failure mode is silent forgery of anyone's identity. Better to not
// start.
const minKeyLen = 32

// Session is who a request is from.
type Session struct {
	// UserID is the provider's stable numeric identity, NOT the login.
	// A GitHub user can rename themselves and someone else can then take
	// the freed name; the numeric ID cannot change hands. History is
	// keyed on this, so getting it wrong would hand one person another
	// person's attempts.
	UserID string `json:"uid"`
	// Login is for display only. Never use it to key anything.
	Login   string `json:"login"`
	Expires int64  `json:"exp"`
}

var (
	// ErrInvalidCookie covers every "this is not a cookie we issued"
	// case — malformed, truncated, or signed with a different key. They
	// are deliberately indistinguishable to the caller: telling an
	// attacker which half of their forgery was wrong is free help.
	ErrInvalidCookie = errors.New("auth: invalid session cookie")
	// ErrExpired is separate because it is the one failure that is not
	// suspicious: it is what every returning user hits eventually, and
	// the caller answers it by redirecting to log in again.
	ErrExpired = errors.New("auth: session expired")
)

// Signer encodes and verifies session cookies.
type Signer struct {
	key []byte
	// Now is overridable so expiry can be tested without sleeping.
	Now func() time.Time
}

// NewSigner returns a Signer over key, which must be at least 32 bytes.
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

// Encode returns the cookie value for sess: the payload and its MAC,
// each base64url without padding, separated by a dot.
func (s *Signer) Encode(sess Session) (string, error) {
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", fmt.Errorf("auth: encode session: %w", err)
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	return body + "." + base64.RawURLEncoding.EncodeToString(s.mac(body)), nil
}

// Decode verifies a cookie value and returns the session it carries.
func (s *Signer) Decode(v string) (Session, error) {
	body, sig, ok := strings.Cut(v, ".")
	if !ok {
		return Session{}, ErrInvalidCookie
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return Session{}, ErrInvalidCookie
	}
	// Constant time, and BEFORE the payload is parsed: a forged cookie
	// must not reach the JSON decoder at all.
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
