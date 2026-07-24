package main

import (
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
