package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"
)

// Mode is how the hub decides who someone is.
//
// Three of them, because a self-hoster's situation is not this
// deployment's. github is what the public tier runs; header is for
// anyone already behind an authenticating proxy; none is for a private
// network where the whole question is uninteresting. The plan's promise
// that a third party can self-host with their own limits is only true if
// they are not forced to register a GitHub OAuth app first.
type Mode string

const (
	ModeGitHub Mode = "github"
	ModeHeader Mode = "header"
	ModeNone   Mode = "none"
)

// ParseMode validates an AUTH_MODE value.
func ParseMode(s string) (Mode, error) {
	switch Mode(s) {
	case ModeGitHub, ModeHeader, ModeNone:
		return Mode(s), nil
	}
	return "", fmt.Errorf("auth: unknown AUTH_MODE %q (want github, header or none)", s)
}

// DefaultCookieName is the session cookie. __Host- is not cosmetic: it
// makes the browser refuse the cookie unless it is Secure, path=/ and
// has no Domain, which forecloses a subdomain setting a cookie for the
// hub. Dropped automatically when Secure is off, since the prefix would
// make the cookie unsettable over plain HTTP in local development.
const DefaultCookieName = "__Host-kubestronaut_session"

// ErrNoSession means nobody is logged in — not that anything failed.
var ErrNoSession = errors.New("auth: no session")

// Authenticator resolves the current user and issues session cookies.
type Authenticator struct {
	Mode   Mode
	Signer *Signer
	GitHub *GitHub

	// HeaderName is the trusted identity header for ModeHeader.
	//
	// SECURITY: in header mode the hub MUST NOT be reachable except
	// through the proxy that sets it, because anyone who can reach the
	// hub directly can set it too and become any user. The mode exists
	// for a deployment that already terminates auth upstream; it is not
	// a way to add auth.
	HeaderName string

	CookieName string
	// Secure marks the cookie Secure and enables the __Host- prefix.
	Secure bool
	TTL    time.Duration

	Now func() time.Time
}

func (a *Authenticator) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func (a *Authenticator) cookieName() string {
	if a.CookieName != "" {
		return a.CookieName
	}
	if !a.Secure {
		// __Host- requires Secure, so over plain HTTP the browser would
		// silently drop every cookie we set and the user would loop
		// through login forever.
		return "kubestronaut_session"
	}
	return DefaultCookieName
}

func (a *Authenticator) ttl() time.Duration {
	if a.TTL > 0 {
		return a.TTL
	}
	return 12 * time.Hour
}

// Current returns the session for r, or ErrNoSession.
func (a *Authenticator) Current(r *http.Request) (Session, error) {
	switch a.Mode {
	case ModeNone:
		// One fixed identity. It still goes through the store's name
		// rules, so it is a plain name rather than something clever.
		return Session{UserID: "local", Login: "local"}, nil

	case ModeHeader:
		name := a.HeaderName
		if name == "" {
			name = "X-Forwarded-User"
		}
		v := r.Header.Get(name)
		if v == "" {
			return Session{}, ErrNoSession
		}
		return Session{UserID: v, Login: v}, nil

	case ModeGitHub:
		c, err := r.Cookie(a.cookieName())
		if err != nil || c.Value == "" {
			return Session{}, ErrNoSession
		}
		if a.Signer == nil {
			return Session{}, errors.New("auth: github mode without a signer")
		}
		sess, err := a.Signer.Decode(c.Value)
		if err != nil {
			// Both a forgery and an expiry mean the same thing to the
			// caller: nobody is logged in. They differ in the log, not
			// in the response.
			return Session{}, ErrNoSession
		}
		return sess, nil
	}
	return Session{}, fmt.Errorf("auth: unconfigured mode %q", a.Mode)
}

// Issue sets the session cookie for sess, stamping its expiry.
func (a *Authenticator) Issue(w http.ResponseWriter, sess Session) error {
	if a.Signer == nil {
		return errors.New("auth: cannot issue a cookie without a signer")
	}
	expires := a.now().Add(a.ttl())
	sess.Expires = expires.Unix()
	v, err := a.Signer.Encode(sess)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     a.cookieName(),
		Value:    v,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.Secure,
		// Lax, not Strict: the OAuth callback is a cross-site
		// navigation back from github.com, and Strict would not send
		// the cookie on it — so login would appear to succeed and then
		// land the user logged out.
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
	return nil
}

// Clear removes the session cookie.
func (a *Authenticator) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     a.cookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.Secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// NewState returns a CSRF state token for the OAuth round trip.
func NewState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: generate state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
