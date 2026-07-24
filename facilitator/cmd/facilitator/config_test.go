package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEnvOrUsesDefaultWhenUnset(t *testing.T) {
	key := "FACILITATOR_TEST_ENVOR_UNSET"
	t.Setenv(key, "")
	if got := envOr(key, "default"); got != "default" {
		t.Errorf("envOr(unset) = %q, want %q", got, "default")
	}
}

func TestEnvOrUsesValueWhenSet(t *testing.T) {
	key := "FACILITATOR_TEST_ENVOR_SET"
	t.Setenv(key, "custom-value")
	if got := envOr(key, "default"); got != "custom-value" {
		t.Errorf("envOr(set) = %q, want %q", got, "custom-value")
	}
}

func TestResolveDurationNoOverride(t *testing.T) {
	base := 120 * time.Minute
	got, err := resolveDuration(base, "")
	if err != nil {
		t.Fatalf("resolveDuration(base, \"\") error = %v, want nil", err)
	}
	if got != base {
		t.Errorf("resolveDuration(base, \"\") = %v, want %v (unchanged)", got, base)
	}
}

func TestResolveDurationWithOverride(t *testing.T) {
	base := 120 * time.Minute
	got, err := resolveDuration(base, "20s")
	if err != nil {
		t.Fatalf("resolveDuration(base, \"20s\") error = %v, want nil", err)
	}
	if got != 20*time.Second {
		t.Errorf("resolveDuration(base, \"20s\") = %v, want 20s", got)
	}
}

func TestResolveDurationInvalidOverride(t *testing.T) {
	if _, err := resolveDuration(time.Hour, "not-a-duration"); err == nil {
		t.Error("resolveDuration with invalid override: got nil error, want non-nil")
	}
}

func TestCheckSSHKeyMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "does-not-exist")
	if err := checkSSHKey(path); err == nil {
		t.Error("checkSSHKey with a missing file: got nil error, want non-nil")
	}
}

func TestCheckSSHKeyExists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(path, []byte("fake key material"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if err := checkSSHKey(path); err != nil {
		t.Errorf("checkSSHKey with an existing file: got error %v, want nil", err)
	}
}
