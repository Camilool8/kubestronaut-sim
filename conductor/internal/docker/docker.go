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

const apiVersion = "v1.43"

type Client struct {
	http *http.Client
}

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

func drainExec(r io.Reader, onLine func(string)) (string, error) {
	var out bytes.Buffer
	var line []byte
	var pending []byte
	plain := false

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
					break
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
