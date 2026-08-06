package kube

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	tokenPath     = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	caPath        = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	namespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
)

var (
	ErrNotFound  = errors.New("kube: not found")
	ErrConflict  = errors.New("kube: already exists")
	ErrForbidden = errors.New("kube: forbidden — check the hub's Role")
)

type Pod struct {
	Metadata Metadata  `json:"metadata"`
	Status   PodStatus `json:"status"`
}

type Metadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace,omitempty"`
	Labels            map[string]string `json:"labels,omitempty"`
	CreationTimestamp time.Time         `json:"creationTimestamp,omitempty"`

	DeletionTimestamp *time.Time `json:"deletionTimestamp,omitempty"`
}

type PodStatus struct {
	Phase             string            `json:"phase"`
	PodIP             string            `json:"podIP"`
	ContainerStatuses []ContainerStatus `json:"containerStatuses"`
}

type ContainerStatus struct {
	Name  string `json:"name"`
	Ready bool   `json:"ready"`
}

func (p Pod) Terminating() bool { return p.Metadata.DeletionTimestamp != nil }

func (p Pod) Ready(container string) bool {
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Name == container {
			return cs.Ready
		}
	}
	return false
}

type Client struct {
	BaseURL   string
	Namespace string
	HTTP      *http.Client

	TokenFile string

	Token string

	mu       sync.Mutex
	lastRead time.Time
	cached   string
}

func InCluster() (*Client, error) {
	host, port := os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return nil, errors.New("kube: not running in a cluster (no KUBERNETES_SERVICE_HOST)")
	}
	ns, err := os.ReadFile(namespacePath)
	if err != nil {
		return nil, fmt.Errorf("kube: read namespace: %w", err)
	}
	ca, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("kube: read CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, fmt.Errorf("kube: %s is not a usable CA bundle", caPath)
	}
	return &Client{
		BaseURL:   "https://" + net.JoinHostPort(host, port),
		Namespace: strings.TrimSpace(string(ns)),
		TokenFile: tokenPath,
		HTTP: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
			},
		},
	}, nil
}

func (c *Client) token() (string, error) {
	if c.Token != "" {
		return c.Token, nil
	}
	if c.TokenFile == "" {
		return "", nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cached != "" && time.Since(c.lastRead) < 30*time.Second {
		return c.cached, nil
	}
	b, err := os.ReadFile(c.TokenFile)
	if err != nil {
		return "", fmt.Errorf("kube: read token: %w", err)
	}
	c.cached, c.lastRead = strings.TrimSpace(string(b)), time.Now()
	return c.cached, nil
}

func (c *Client) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

func (c *Client) CreatePod(ctx context.Context, spec []byte) (Pod, error) {
	var out Pod
	err := c.do(ctx, http.MethodPost, c.podsURL(), spec, &out)
	return out, err
}

func (c *Client) GetPod(ctx context.Context, name string) (Pod, error) {
	var out Pod
	err := c.do(ctx, http.MethodGet, c.podsURL()+"/"+url.PathEscape(name), nil, &out)
	return out, err
}

func (c *Client) DeletePod(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodDelete, c.podsURL()+"/"+url.PathEscape(name), nil, nil)
}

func (c *Client) ListPods(ctx context.Context, selector string) ([]Pod, error) {
	u := c.podsURL()
	if selector != "" {
		u += "?labelSelector=" + url.QueryEscape(selector)
	}
	var out struct {
		Items []Pod `json:"items"`
	}
	if err := c.do(ctx, http.MethodGet, u, nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

func (c *Client) podsURL() string {
	return fmt.Sprintf("%s/api/v1/namespaces/%s/pods",
		strings.TrimSuffix(c.BaseURL, "/"), url.PathEscape(c.Namespace))
}

func (c *Client) do(ctx context.Context, method, u string, body []byte, out any) error {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rdr)
	if err != nil {
		return fmt.Errorf("kube: %s %s: %w", method, u, err)
	}
	tok, err := c.token()
	if err != nil {
		return err
	}
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("kube: %s %s: %w", method, u, err)
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("kube: read %s %s: %w", method, u, err)
	}

	switch resp.StatusCode {
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusConflict:
		return ErrConflict
	case http.StatusForbidden, http.StatusUnauthorized:
		return fmt.Errorf("%w: %s", ErrForbidden, apiMessage(b))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("kube: %s %s: %s: %s", method, u, resp.Status, apiMessage(b))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("kube: decode %s %s: %w", method, u, err)
	}
	return nil
}

func apiMessage(b []byte) string {
	var status struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(b, &status); err == nil && status.Message != "" {
		return status.Message
	}
	s := strings.TrimSpace(string(b))
	if len(s) > 300 {
		s = s[:300] + "…"
	}
	return s
}
