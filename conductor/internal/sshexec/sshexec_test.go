package sshexec

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestShellQuote(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "bash", `'bash'`},
		{"spaces", "a b", `'a b'`},
		{"semicolon", "podman rm -af; podman rmi -af", `'podman rm -af; podman rmi -af'`},
		{"double quote", `say "hi"`, `'say "hi"'`},
		{"single quote", "it's", `'it'\''s'`},
		{"empty", "", `''`},
		{"dollar", "$HOME", `'$HOME'`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := shellQuote(c.in); got != c.want {
				t.Errorf("shellQuote(%q) = %s, want %s", c.in, got, c.want)
			}
		})
	}
}

func TestRemoteCommandKeepsScriptAsOneWord(t *testing.T) {
	got := remoteCommand(wipeLike())
	want := `'sh' '-c' 'find /opt/course -mindepth 1 -delete; podman rm -af; podman rmi -af'`
	if got != want {
		t.Errorf("remoteCommand:\n got %s\nwant %s", got, want)
	}
}

func wipeLike() []string {
	return []string{"sh", "-c", "find /opt/course -mindepth 1 -delete; podman rm -af; podman rmi -af"}
}

func TestArgsCarryKeyUserHostAndCommand(t *testing.T) {
	c := &Client{keyPath: "/shared/ssh/id_ed25519", user: "root", controlPath: "/tmp/ssh-mux/%C"}
	args := c.args("k8s-env", []string{"bash", "-c", "echo hi"})

	joined := strings.Join(args, " ")
	for _, want := range []string{
		"-o StrictHostKeyChecking=no",
		"-o UserKnownHostsFile=/dev/null",
		"-o BatchMode=yes",
		"-o ControlMaster=auto",
		"-o ControlPath=/tmp/ssh-mux/%C",
		"-o ControlPersist=60s",
		"-i /shared/ssh/id_ed25519",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("args missing %q; got %v", want, args)
		}
	}

	if got := args[len(args)-2]; got != "root@k8s-env" {
		t.Errorf("destination = %q, want root@k8s-env (default user)", got)
	}
	if got := args[len(args)-1]; got != `'bash' '-c' 'echo hi'` {
		t.Errorf("remote command = %s", got)
	}
}

func TestArgsOmitsKeyFlagWhenNoKey(t *testing.T) {
	c := New("", "candidate")
	for _, a := range c.args("instance-1", []string{"true"}) {
		if a == "-i" {
			t.Fatal("args included -i with no key path")
		}
	}
}

func TestArgsWithoutAControlPathAreUnchanged(t *testing.T) {
	c := &Client{keyPath: "/k", user: "root"}

	want := []string{
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "LogLevel=ERROR",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=10",
		"-i", "/k",
		"root@instance-1", `'true'`,
	}
	if got := c.args("instance-1", []string{"true"}); !reflect.DeepEqual(got, want) {
		t.Errorf("args = %#v, want %#v", got, want)
	}
}

func TestControlPathCreatesADirectoryOnlyRootCanRead(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ssh-mux")

	got := controlPath(dir)

	if want := filepath.Join(dir, "%C"); got != want {
		t.Errorf("controlPath(%q) = %q, want %q", dir, got, want)
	}
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("control directory was not created: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o700 {
		t.Errorf("control directory mode = %o, want 700", perm)
	}
}

// An unusable ControlPath is not a fallback: ssh exits 255 rather than opening
// an ordinary connection, so the exec would fail outright. Losing the directory
// has to cost multiplexing, not the command.
func TestControlPathIsEmptyWhenTheDirectoryCannotBeMade(t *testing.T) {
	blocked := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blocked, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	if got := controlPath(filepath.Join(blocked, "ssh-mux")); got != "" {
		t.Errorf("controlPath = %q, want \"\" so args leaves multiplexing out", got)
	}
	if args := controlArgs(""); args != nil {
		t.Errorf("controlArgs(\"\") = %v, want nil", args)
	}
}

// ssh binds the socket at ControlPath with %C expanded to a 40-character hash
// and a random suffix appended while it connects, and an AF_UNIX address runs
// out at about 104 bytes on some platforms.
func TestControlDirLeavesRoomForTheSocketName(t *testing.T) {
	const hashed, tempSuffix, unixPathMax = 40, 17, 104

	if size := len(controlDir) + len("/") + hashed + tempSuffix; size >= unixPathMax {
		t.Errorf("%q expands to a %d-byte socket path, want under %d", controlDir, size, unixPathMax)
	}
}

func TestFindContainerReturnsServiceName(t *testing.T) {
	c := New("/k", "root")
	got, err := c.FindContainer(context.Background(), "ignored-project", "k8s-env")
	if err != nil {
		t.Fatalf("FindContainer: %v", err)
	}
	if got != "k8s-env" {
		t.Errorf("FindContainer = %q, want k8s-env", got)
	}
	if _, err := c.FindContainer(context.Background(), "p", ""); err == nil {
		t.Error("empty service name should be an error")
	}
}

func TestRestartIsUnsupported(t *testing.T) {
	c := New("/k", "root")
	err := c.Restart(context.Background(), "instance-1", 10)
	if !errors.Is(err, ErrRestartUnsupported) {
		t.Fatalf("Restart error = %v, want ErrRestartUnsupported", err)
	}
	if !strings.Contains(err.Error(), "instance-1") {
		t.Errorf("Restart error should name the host; got %v", err)
	}
}

func TestExecRejectsEmptyCommand(t *testing.T) {
	c := New("/k", "root")
	if _, _, err := c.Exec(context.Background(), "k8s-env", nil, nil); err == nil {
		t.Error("empty command should be an error")
	}
}

func TestLineWriterPublishesCompleteLinesAsTheyArrive(t *testing.T) {
	var got []string
	w := &lineWriter{onLine: func(s string) { got = append(got, s) }}

	w.Write([]byte("first\nsec"))
	if len(got) != 1 || got[0] != "first" {
		t.Fatalf("after partial write, lines = %v, want [first]", got)
	}
	w.Write([]byte("ond\nthird"))
	if len(got) != 2 || got[1] != "second" {
		t.Fatalf("lines = %v, want [first second]", got)
	}

	w.flush()
	if len(got) != 3 || got[2] != "third" {
		t.Fatalf("after flush, lines = %v, want [first second third]", got)
	}
	if w.all.String() != "first\nsecond\nthird" {
		t.Errorf("accumulated output = %q", w.all.String())
	}
}

func TestLineWriterStripsCarriageReturns(t *testing.T) {
	var got []string
	w := &lineWriter{onLine: func(s string) { got = append(got, s) }}
	w.Write([]byte("progress\r\n"))
	if len(got) != 1 || got[0] != "progress" {
		t.Errorf("lines = %q, want [progress]", got)
	}
}

func TestLineWriterWithoutCallbackStillAccumulates(t *testing.T) {
	w := &lineWriter{}
	w.Write([]byte("a\nb\n"))
	w.flush()
	if w.all.String() != "a\nb\n" {
		t.Errorf("accumulated = %q, want \"a\\nb\\n\"", w.all.String())
	}
}
