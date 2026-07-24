package main

import (
	"fmt"
	"os"
	"time"
)

// envOr returns the environment variable key's value, or def if it is
// unset or set to the empty string.
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// resolveDuration returns dur unchanged when overrideEnv is empty (the
// SESSION_DURATION_OVERRIDE env var is unset), or the result of parsing
// overrideEnv as a time.Duration otherwise — letting a single env var
// shorten exam sessions (e.g. for an auto-end smoke test) without
// touching the bank's exam.yaml.
func resolveDuration(dur time.Duration, overrideEnv string) (time.Duration, error) {
	if overrideEnv == "" {
		return dur, nil
	}
	return time.ParseDuration(overrideEnv)
}

// checkSSHKey validates that the ssh private key at path exists on
// disk, so the server (not the session-free `grade` subcommand, which
// fails the same way naturally the first time it tries to connect)
// fails fast at boot with a clear message — per the design's
// "malformed/missing exam JSON, bank dir, or ssh key ⇒ facilitator
// exits non-zero at boot" contract — instead of only surfacing as an
// opaque ssh connection failure the first time a grade actually runs.
func checkSSHKey(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("ssh key %s: %w", path, err)
	}
	return nil
}
