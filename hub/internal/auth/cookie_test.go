package auth

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func testSigner(t *testing.T) *Signer {
	t.Helper()
	s, err := NewSigner([]byte(strings.Repeat("k", 32)))
	if err != nil {
		t.Fatalf("NewSigner: %v", err)
	}
	return s
}

func TestRoundTrip(t *testing.T) {
	s := testSigner(t)
	want := Session{UserID: "12345", Login: "octocat", Expires: time.Now().Add(time.Hour).Unix()}

	v, err := s.Encode(want)
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	got, err := s.Decode(v)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if got != want {
		t.Errorf("round trip = %+v, want %+v", got, want)
	}
}

// A short key is refused at construction rather than stretched, because
// a hub running on COOKIE_KEY=secret looks identical from the outside to
// one that is safe.
func TestShortKeysAreRefused(t *testing.T) {
	for _, k := range []string{"", "secret", strings.Repeat("k", 31)} {
		if _, err := NewSigner([]byte(k)); err == nil {
			t.Errorf("NewSigner(%d bytes) succeeded, want an error", len(k))
		}
	}
	if _, err := NewSigner([]byte(strings.Repeat("k", 32))); err != nil {
		t.Errorf("NewSigner(32 bytes) = %v, want success", err)
	}
}

func TestTamperingIsRejected(t *testing.T) {
	s := testSigner(t)
	good, err := s.Encode(Session{UserID: "12345", Login: "octocat"})
	if err != nil {
		t.Fatal(err)
	}
	body, sig, _ := strings.Cut(good, ".")

	// The payload of a different user, with the original signature: the
	// forgery this whole mechanism exists to stop.
	other, _ := s.Encode(Session{UserID: "99999", Login: "attacker"})
	otherBody, _, _ := strings.Cut(other, ".")

	for name, v := range map[string]string{
		"swapped payload":  otherBody + "." + sig,
		"flipped sig byte": body + "." + flip(sig),
		"no separator":     body + sig,
		"empty":            "",
		"only a payload":   body,
		"garbage":          "not-a-cookie",
		"empty payload":    "." + sig,
	} {
		if _, err := s.Decode(v); !errors.Is(err, ErrInvalidCookie) {
			t.Errorf("Decode(%s) error = %v, want ErrInvalidCookie", name, err)
		}
	}
}

// A cookie signed with a different key must be indistinguishable from
// any other forgery — including to a caller trying to be helpful.
func TestAnotherKeysCookieIsInvalid(t *testing.T) {
	mine := testSigner(t)
	theirs, err := NewSigner([]byte(strings.Repeat("z", 32)))
	if err != nil {
		t.Fatal(err)
	}
	v, err := theirs.Encode(Session{UserID: "12345", Login: "octocat"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mine.Decode(v); !errors.Is(err, ErrInvalidCookie) {
		t.Errorf("Decode of a foreign cookie = %v, want ErrInvalidCookie", err)
	}
}

func TestExpiryIsEnforcedAndDistinguishable(t *testing.T) {
	s := testSigner(t)
	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	s.Now = func() time.Time { return now }

	v, err := s.Encode(Session{UserID: "12345", Expires: now.Add(-time.Second).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	// Expired is its own error: it is the one failure that is normal, and
	// the caller answers it by asking the user to log in again rather
	// than by treating them as an attacker.
	if _, err := s.Decode(v); !errors.Is(err, ErrExpired) {
		t.Errorf("Decode of an expired cookie = %v, want ErrExpired", err)
	}

	fresh, _ := s.Encode(Session{UserID: "12345", Expires: now.Add(time.Hour).Unix()})
	if _, err := s.Decode(fresh); err != nil {
		t.Errorf("Decode of a live cookie = %v, want success", err)
	}
}

// A session with no user is not a session, however well signed.
func TestSessionWithoutAUserIsInvalid(t *testing.T) {
	s := testSigner(t)
	v, err := s.Encode(Session{Login: "octocat", Expires: time.Now().Add(time.Hour).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Decode(v); !errors.Is(err, ErrInvalidCookie) {
		t.Errorf("Decode of a session with no UserID = %v, want ErrInvalidCookie", err)
	}
}

func flip(s string) string {
	if s == "" {
		return "x"
	}
	b := []byte(s)
	if b[0] == 'A' {
		b[0] = 'B'
	} else {
		b[0] = 'A'
	}
	return string(b)
}
