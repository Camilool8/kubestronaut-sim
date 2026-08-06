package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type Mode string

const (
	ModeGitHub Mode = "github"
	ModeHeader Mode = "header"
	ModeNone   Mode = "none"
)

func ParseMode(s string) (Mode, error) {
	switch Mode(s) {
	case ModeGitHub, ModeHeader, ModeNone:
		return Mode(s), nil
	}
	return "", fmt.Errorf("auth: unknown AUTH_MODE %q (want github, header or none)", s)
}

const DefaultCookieName = "__Host-kubestronaut_session"

var ErrNoSession = errors.New("auth: no session")

type Authenticator struct {
	Mode   Mode
	Signer *Signer
	GitHub *GitHub

	HeaderName string

	CookieName string

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

func (a *Authenticator) Current(r *http.Request) (Session, error) {
	switch a.Mode {
	case ModeNone:

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

			return Session{}, ErrNoSession
		}
		return sess, nil
	}
	return Session{}, fmt.Errorf("auth: unconfigured mode %q", a.Mode)
}

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

		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
	return nil
}

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

func NewState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("auth: generate state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
