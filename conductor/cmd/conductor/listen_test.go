package main

import (
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestListenOnTCPIsUnchanged(t *testing.T) {
	ln, err := listen("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if _, ok := ln.Addr().(*net.TCPAddr); !ok {
		t.Errorf("addr = %T, want a TCP address", ln.Addr())
	}
}

func TestListenOnASocketCreatesItPrivate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "c.sock")
	ln, err := listen(unixPrefix + path)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("socket was not created: %v", err)
	}
	// 0600 is the second lock on a boundary the mount already draws.
	// Loosening it silently would put the control API back within reach
	// of anything that later shares the volume.
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("mode = %v, want 0600", perm)
	}
	if info.Mode().Type()&fs.ModeSocket == 0 {
		t.Errorf("%s is not a socket (%v)", path, info.Mode())
	}
	if _, err := net.Dial("unix", path); err != nil {
		t.Errorf("nothing is listening: %v", err)
	}
}

// A socket file outlives a process that dies without closing it, and
// net.Listen refuses to bind over one. Go unlinks on a clean Close, so
// the case only arises when the conductor is killed — a SIGKILL, an
// OOM, a `docker compose kill` — and then the volume still holds the
// file the next start has to bind. SetUnlinkOnClose(false) is that
// death, reproduced: without the unlink, every restart after a hard
// kill fails against a file nothing is listening on.
func TestListenReplacesASocketLeftByAKilledConductor(t *testing.T) {
	path := filepath.Join(t.TempDir(), "c.sock")
	stale, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	stale.(*net.UnixListener).SetUnlinkOnClose(false)
	stale.Close()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("setup did not leave a socket behind: %v", err)
	}

	ln, err := listen(unixPrefix + path)
	if err != nil {
		t.Fatalf("stale socket was not replaced: %v", err)
	}
	defer ln.Close()
	if _, err := net.Dial("unix", path); err != nil {
		t.Errorf("nothing is listening after replacing: %v", err)
	}
}
