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
	"errors"
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
//
// onLine (may be nil) receives each complete output line as it arrives,
// not when the command exits. The conductor uses it to surface live
// progress from multi-minute commands — a kind cluster rebuild prints
// its own checklist, and without this the UI has nothing to show for
// minutes at a time.
func (c *Client) Exec(ctx context.Context, containerID string, cmd []string, onLine func(string)) (int, string, error) {
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
	output, err := drainExec(resp.Body, onLine)
	resp.Body.Close()
	if err != nil {
		return 0, "", fmt.Errorf("docker: read exec output: %w", err)
	}

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

// drainExec reads docker's multiplexed exec stream to EOF and returns
// the combined stdout+stderr output, passing each complete line to
// onLine (may be nil) as soon as it arrives.
//
// The wire format is an 8-byte header — stream byte, 3 zero bytes,
// big-endian payload length — followed by the payload. Frames arrive
// split across reads and a single line may span several frames, so both
// the frame boundary and the line boundary are tracked incrementally.
// Input that isn't multiplexed (or is truncated mid-frame) is passed
// through rather than dropped, matching what the daemon does when the
// exec was allocated a TTY.
func drainExec(r io.Reader, onLine func(string)) (string, error) {
	var out bytes.Buffer
	var line []byte
	var pending []byte
	plain := false // the stream turned out not to be stdcopy-framed

	emit := func(payload []byte) {
		out.Write(payload)
		if onLine == nil {
			return
		}
		line = append(line, payload...)
		for {
			i := bytes.IndexByte(line, '\n')
			if i < 0 {
				return
			}
			if s := strings.TrimSpace(string(line[:i])); s != "" {
				onLine(s)
			}
			line = line[i+1:]
		}
	}

	buf := make([]byte, 32*1024)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			pending = append(pending, buf[:n]...)
			for !plain && len(pending) >= 8 {
				if pending[0] > 2 || pending[1] != 0 || pending[2] != 0 || pending[3] != 0 {
					plain = true
					break
				}
				frameEnd := 8 + int(binary.BigEndian.Uint32(pending[4:8]))
				if frameEnd > len(pending) {
					break // wait for the rest of this frame
				}
				emit(pending[8:frameEnd])
				pending = pending[frameEnd:]
			}
			if plain {
				emit(pending)
				pending = nil
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return out.String(), err
		}
	}

	// Flush a truncated trailing frame, then any final line the command
	// left without a newline.
	if len(pending) > 0 {
		if !plain && len(pending) > 8 {
			emit(pending[8:])
		} else if plain {
			emit(pending)
		}
	}
	if len(line) > 0 && onLine != nil {
		if s := strings.TrimSpace(string(line)); s != "" {
			onLine(s)
		}
	}
	return out.String(), nil
}
