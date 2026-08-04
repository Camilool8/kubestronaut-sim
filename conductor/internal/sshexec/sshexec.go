// Package sshexec is a control.Engine for deployments with no Docker
// socket to hold. Under compose the conductor finds a service's container
// by its compose labels and drives it over the Engine API; in a Kubernetes
// Pod there is no socket to mount and no container to look up, so the same
// three calls go over ssh to the service's hostname instead.
//
// It shells out to the ssh binary rather than speaking the protocol,
// which is what facilitator/internal/evaluate already does to reach the
// instances for grading — same flags, same assumption that the key in
// /shared is the one that works.
//
// What this deliberately cannot do is Restart: there is no per-container
// restart in a Pod, and the hosted deployment does not want one. Reset and
// bank switch are the hub's job there, and it does them by recycling the
// whole Pod. Only training-mode reseed still needs a live exec.
package sshexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// ErrRestartUnsupported is returned by Restart. It is a distinct error so
// a caller can tell "this engine cannot" from "this restart failed".
var ErrRestartUnsupported = errors.New("sshexec: restart is not available over ssh; recycle the Pod instead")

// CanRestart reports false — see Restart. The controller asks before it
// begins a reset or a switch, so a job that would die at its restart
// phase is refused up front instead of after its earlier phases have
// wiped the instances and rewritten the active bank.
func (c *Client) CanRestart() bool { return false }

// Client runs commands on the other containers of its own Pod over ssh.
type Client struct {
	keyPath string
	user    string
}

// New returns a Client authenticating with the private key at keyPath as
// user. keyPath is the shared key k8s-env generates during bootstrap.
func New(keyPath, user string) *Client {
	if user == "" {
		user = "root"
	}
	return &Client{keyPath: keyPath, user: user}
}

// FindContainer returns service unchanged. The Engine contract is "resolve
// a service name to something Exec accepts", and over ssh that is the
// hostname — which hostAliases in the Pod spec points at the right
// loopback address. project is meaningless here and is ignored.
func (c *Client) FindContainer(_ context.Context, _, service string) (string, error) {
	if service == "" {
		return "", errors.New("sshexec: empty service name")
	}
	return service, nil
}

// Exec runs cmd on host, waiting for completion, and returns the exit code
// plus the combined stdout+stderr output.
//
// onLine (may be nil) receives each complete output line as it arrives,
// giving a multi-minute command a visible heartbeat — the same contract
// the Docker engine's exec stream provides.
//
// cmd is an argv, but ssh hands its arguments to the remote login shell as
// one string, so every element is single-quoted to survive that re-parse.
// Without it a command like `sh -c "podman rm -af; podman rmi -af"` would
// be split on the remote side and the second half would run in the wrong
// context.
func (c *Client) Exec(ctx context.Context, host string, cmd []string, onLine func(string)) (int, string, error) {
	if len(cmd) == 0 {
		return 0, "", errors.New("sshexec: empty command")
	}

	w := &lineWriter{onLine: onLine}
	proc := exec.CommandContext(ctx, "ssh", c.args(host, cmd)...)
	// Assigning the identical writer to both means os/exec serialises the
	// two streams onto it for us, so interleaving needs no lock here.
	proc.Stdout = w
	proc.Stderr = w

	err := proc.Run()
	w.flush()
	out := w.all.String()

	if err == nil {
		return 0, out, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		// ssh reports its own failures as 255, which a remote command may
		// also legitimately return. The output is the only way to tell
		// them apart, and it is already being surfaced to the caller.
		return exitErr.ExitCode(), out, nil
	}
	return 0, out, fmt.Errorf("sshexec: run ssh to %s: %w", host, err)
}

// Restart always fails. See the package comment.
func (c *Client) Restart(_ context.Context, host string, _ int) error {
	return fmt.Errorf("%w (host %s)", ErrRestartUnsupported, host)
}

// args builds the ssh argv, matching the flags
// facilitator/internal/evaluate uses so both paths behave the same way
// against the same key and the same throwaway host keys.
func (c *Client) args(host string, cmd []string) []string {
	args := []string{
		"-o", "StrictHostKeyChecking=no",
		"-o", "UserKnownHostsFile=/dev/null",
		"-o", "LogLevel=ERROR",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=10",
	}
	if c.keyPath != "" {
		args = append(args, "-i", c.keyPath)
	}
	return append(args, c.user+"@"+host, remoteCommand(cmd))
}

// remoteCommand renders an argv as one shell word-list the remote shell
// will parse back into the same argv.
func remoteCommand(cmd []string) string {
	quoted := make([]string, len(cmd))
	for i, a := range cmd {
		quoted[i] = shellQuote(a)
	}
	return strings.Join(quoted, " ")
}

// shellQuote wraps s so a POSIX shell reproduces it verbatim. Single
// quotes protect everything except a single quote itself, which has to
// leave the quoted run, emit an escaped one, and re-enter.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// lineWriter accumulates everything written to it and publishes complete
// lines to onLine as they arrive.
type lineWriter struct {
	all     bytes.Buffer
	partial bytes.Buffer
	onLine  func(string)
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.all.Write(p)
	if w.onLine == nil {
		return len(p), nil
	}
	for _, b := range p {
		if b == '\n' {
			w.onLine(strings.TrimRight(w.partial.String(), "\r"))
			w.partial.Reset()
			continue
		}
		w.partial.WriteByte(b)
	}
	return len(p), nil
}

// flush publishes a trailing line that never got its newline.
func (w *lineWriter) flush() {
	if w.onLine == nil || w.partial.Len() == 0 {
		return
	}
	w.onLine(strings.TrimRight(w.partial.String(), "\r"))
	w.partial.Reset()
}
