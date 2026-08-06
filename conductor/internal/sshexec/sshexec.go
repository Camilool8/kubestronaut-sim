package sshexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

var ErrRestartUnsupported = errors.New("sshexec: restart is not available over ssh; recycle the Pod instead")

func (c *Client) CanRestart() bool { return false }

type Client struct {
	keyPath string
	user    string
}

func New(keyPath, user string) *Client {
	if user == "" {
		user = "root"
	}
	return &Client{keyPath: keyPath, user: user}
}

func (c *Client) FindContainer(_ context.Context, _, service string) (string, error) {
	if service == "" {
		return "", errors.New("sshexec: empty service name")
	}
	return service, nil
}

func (c *Client) Exec(ctx context.Context, host string, cmd []string, onLine func(string)) (int, string, error) {
	if len(cmd) == 0 {
		return 0, "", errors.New("sshexec: empty command")
	}

	w := &lineWriter{onLine: onLine}
	proc := exec.CommandContext(ctx, "ssh", c.args(host, cmd)...)

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

		return exitErr.ExitCode(), out, nil
	}
	return 0, out, fmt.Errorf("sshexec: run ssh to %s: %w", host, err)
}

func (c *Client) Restart(_ context.Context, host string, _ int) error {
	return fmt.Errorf("%w (host %s)", ErrRestartUnsupported, host)
}

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

func remoteCommand(cmd []string) string {
	quoted := make([]string, len(cmd))
	for i, a := range cmd {
		quoted[i] = shellQuote(a)
	}
	return strings.Join(quoted, " ")
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

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

func (w *lineWriter) flush() {
	if w.onLine == nil || w.partial.Len() == 0 {
		return
	}
	w.onLine(strings.TrimRight(w.partial.String(), "\r"))
	w.partial.Reset()
}
