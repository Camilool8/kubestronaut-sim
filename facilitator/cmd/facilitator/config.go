package main

import (
	"fmt"
	"os"
	"time"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func resolveDuration(dur time.Duration, overrideEnv string) (time.Duration, error) {
	if overrideEnv == "" {
		return dur, nil
	}
	return time.ParseDuration(overrideEnv)
}

func checkSSHKey(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("ssh key %s: %w", path, err)
	}
	return nil
}
