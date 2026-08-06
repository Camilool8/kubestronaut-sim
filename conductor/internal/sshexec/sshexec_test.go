package sshexec

import (
	"context"
	"errors"
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
	c := New("/shared/ssh/id_ed25519", "")
	args := c.args("k8s-env", []string{"bash", "-c", "echo hi"})

	joined := strings.Join(args, " ")
	for _, want := range []string{
		"-o StrictHostKeyChecking=no",
		"-o UserKnownHostsFile=/dev/null",
		"-o BatchMode=yes",
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
