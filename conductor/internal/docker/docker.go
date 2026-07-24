// Package docker is a deliberately tiny Docker Engine API client — just
// the three calls the conductor needs (find a compose service's
// container, exec inside it, restart it), stdlib-only, over the mounted
// unix socket. It exists so the conductor does not need the full docker
// SDK or a docker CLI binary in its image.
package docker

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// apiVersion is the minimum Engine API version carrying everything this
// client uses; negotiated-down daemons older than this are not supported.
const apiVersion = "v1.43"

// Client talks to one Docker daemon over its unix socket.
type Client struct {
	http *http.Client
}

// New returns a Client for the daemon behind socketPath.
func New(socketPath string) *Client {
	return &Client{
		http: &http.Client{
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					var d net.Dialer
					return d.DialContext(ctx, "unix", socketPath)
				},
			},
		},
	}
}

// FindContainer resolves the running container of one compose service by
// the labels compose stamps on everything it creates.
func (c *Client) FindContainer(ctx context.Context, project, service string) (string, error) {
	filters, err := json.Marshal(map[string][]string{
		"label": {
			"com.docker.compose.project=" + project,
			"com.docker.compose.service=" + service,
		},
	})
	if err != nil {
		return "", fmt.Errorf("docker: marshal filters: %w", err)
	}

	var containers []struct {
		ID string `json:"Id"`
	}
	path := "/containers/json?filters=" + url.QueryEscape(string(filters))
	if err := c.getJSON(ctx, path, &containers); err != nil {
		return "", fmt.Errorf("docker: list containers for %s/%s: %w", project, service, err)
	}
	if len(containers) == 0 {
		return "", fmt.Errorf("docker: no running container for compose service %q in project %q", service, project)
	}
	return containers[0].ID, nil
}

// Exec runs cmd inside containerID, waiting for completion, and returns
// the exit code plus the combined stdout+stderr output.
func (c *Client) Exec(ctx context.Context, containerID string, cmd []string) (int, string, error) {
	var created struct {
		ID string `json:"Id"`
	}
	createBody := map[string]any{
		"AttachStdout": true,
		"AttachStderr": true,
		"Cmd":          cmd,
	}
	if err := c.postJSON(ctx, "/containers/"+containerID+"/exec", createBody, &created); err != nil {
		return 0, "", fmt.Errorf("docker: create exec: %w", err)
	}

	// Starting a non-detached exec streams the command's multiplexed
	// output as the response body; reading it to EOF is what "waits" for
	// the command to finish.
	resp, err := c.do(ctx, http.MethodPost, "/exec/"+created.ID+"/start",
		strings.NewReader(`{"Detach":false,"Tty":false}`), "application/json")
	if err != nil {
		return 0, "", fmt.Errorf("docker: start exec: %w", err)
	}
	raw, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return 0, "", fmt.Errorf("docker: read exec output: %w", err)
	}
	output := demuxStdcopy(raw)

	var inspect struct {
		ExitCode int `json:"ExitCode"`
	}
	if err := c.getJSON(ctx, "/exec/"+created.ID+"/json", &inspect); err != nil {
		return 0, "", fmt.Errorf("docker: inspect exec: %w", err)
	}
	return inspect.ExitCode, output, nil
}

// Restart restarts containerID, giving it timeoutSec to stop gracefully.
func (c *Client) Restart(ctx context.Context, containerID string, timeoutSec int) error {
	resp, err := c.do(ctx, http.MethodPost,
		fmt.Sprintf("/containers/%s/restart?t=%d", containerID, timeoutSec), nil, "")
	if err != nil {
		return fmt.Errorf("docker: restart: %w", err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return nil
}

// do performs one API request and returns the response, converting any
// non-2xx status into an error carrying the daemon's message.
func (c *Client) do(ctx context.Context, method, path string, body io.Reader, contentType string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, "http://docker/"+apiVersion+path, body)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		defer resp.Body.Close()
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var apiErr struct {
			Message string `json:"message"`
		}
		msg := strings.TrimSpace(string(raw))
		if json.Unmarshal(raw, &apiErr) == nil && apiErr.Message != "" {
			msg = apiErr.Message
		}
		return nil, fmt.Errorf("%s %s: %d: %s", method, path, resp.StatusCode, msg)
	}
	return resp, nil
}

func (c *Client) getJSON(ctx context.Context, path string, out any) error {
	resp, err := c.do(ctx, http.MethodGet, path, nil, "")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) postJSON(ctx context.Context, path string, in, out any) error {
	data, err := json.Marshal(in)
	if err != nil {
		return err
	}
	resp, err := c.do(ctx, http.MethodPost, path, bytes.NewReader(data), "application/json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// demuxStdcopy flattens docker's multiplexed stream format (8-byte
// header: stream byte, 3 zero bytes, big-endian length; then payload)
// into one combined string, interleaved in arrival order. Truncated or
// non-multiplexed input is returned as-is rather than dropped.
func demuxStdcopy(raw []byte) string {
	var buf bytes.Buffer
	rest := raw
	for len(rest) >= 8 {
		stream := rest[0]
		if stream > 2 || rest[1] != 0 || rest[2] != 0 || rest[3] != 0 {
			// not a stdcopy header — treat the remainder as plain output
			buf.Write(rest)
			return buf.String()
		}
		n := binary.BigEndian.Uint32(rest[4:8])
		frameEnd := 8 + int(n)
		if frameEnd > len(rest) {
			buf.Write(rest[8:])
			return buf.String()
		}
		buf.Write(rest[8:frameEnd])
		rest = rest[frameEnd:]
	}
	if len(rest) > 0 {
		buf.Write(rest)
	}
	return buf.String()
}
