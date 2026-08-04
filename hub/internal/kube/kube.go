// Package kube is a hand-rolled Kubernetes client for the four calls the
// hub makes: create, get, delete and list Pods in one namespace.
//
// No client-go, for the same reason conductor/internal/docker hand-rolls
// the Docker Engine API for exactly three calls: the dependency is two
// orders of magnitude larger than the use, and every module in this repo
// is stdlib-only with no go.sum. Four REST calls against a documented,
// versioned API is less code than the vendoring would be.
//
// The Pod type here is deliberately partial. It carries the handful of
// fields the hub reads and nothing else; the spec it sends is passed
// through as bytes, so this package never has to model a PodSpec.
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

// The projected service account token, its CA, and the namespace, at the
// paths the kubelet mounts them.
const (
	tokenPath     = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	caPath        = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	namespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
)

var (
	// ErrNotFound is a 404 from the API server.
	ErrNotFound = errors.New("kube: not found")
	// ErrConflict is a 409 — for a create, that the name is taken.
	ErrConflict = errors.New("kube: already exists")
	// ErrForbidden is a 403, which for this client always means the
	// ServiceAccount's Role is missing a verb rather than anything the
	// caller did wrong.
	ErrForbidden = errors.New("kube: forbidden — check the hub's Role")
)

// Pod is the part of a Pod the hub reads back.
type Pod struct {
	Metadata Metadata  `json:"metadata"`
	Status   PodStatus `json:"status"`
}

// Metadata carries only what the hub uses to decide a Pod's fate:
// which session it belongs to (labels), how old it is, and whether it is
// already on its way out.
type Metadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace,omitempty"`
	Labels            map[string]string `json:"labels,omitempty"`
	CreationTimestamp time.Time         `json:"creationTimestamp,omitempty"`
	// DeletionTimestamp is set the moment a delete is accepted, long
	// before the Pod disappears — a 30s grace period on a session Pod is
	// 30s during which Get still succeeds. Treating a terminating Pod as
	// live is how a seat stays occupied by something already dying.
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

// Terminating reports whether this Pod has been asked to go away.
func (p Pod) Terminating() bool { return p.Metadata.DeletionTimestamp != nil }

// Ready reports whether the named container is passing its readiness
// probe. The hub asks about one container — the facilitator — because
// that is the only one it proxies to, and a session is usable the moment
// that answers. k8s-env's startup probe gates the rest.
func (p Pod) Ready(container string) bool {
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Name == container {
			return cs.Ready
		}
	}
	return false
}

// Client talks to one namespace of one API server.
type Client struct {
	// BaseURL is the API server, e.g. https://10.43.0.1:443.
	BaseURL   string
	Namespace string
	HTTP      *http.Client

	// TokenFile is re-read on every request, not cached at startup.
	//
	// A projected service account token is short-lived by design — the
	// kubelet rotates it well before expiry, and a client that read it
	// once at boot works perfectly until the first rotation and then
	// 401s forever. Re-reading is one page-cached read per API call, and
	// the hub makes a handful per minute.
	TokenFile string
	// Token, when set, is used instead of TokenFile. For tests and for
	// running the hub outside the cluster.
	Token string

	mu       sync.Mutex
	lastRead time.Time
	cached   string
}

// InCluster builds a Client from the ServiceAccount the kubelet
// projected into this Pod.
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
	// A short cache so a burst of calls does not re-read the file each
	// time, short enough that a rotation is picked up promptly.
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

// CreatePod posts a Pod manifest as JSON. spec is passed through
// untouched: this package models what it reads, never what it writes.
func (c *Client) CreatePod(ctx context.Context, spec []byte) (Pod, error) {
	var out Pod
	err := c.do(ctx, http.MethodPost, c.podsURL(), spec, &out)
	return out, err
}

// GetPod returns one Pod, or ErrNotFound.
func (c *Client) GetPod(ctx context.Context, name string) (Pod, error) {
	var out Pod
	err := c.do(ctx, http.MethodGet, c.podsURL()+"/"+url.PathEscape(name), nil, &out)
	return out, err
}

// DeletePod removes a Pod. A Pod that is already gone is not an error to
// the caller that wanted it gone — ErrNotFound is returned so a caller
// who cares can tell, and every caller here treats it as success.
func (c *Client) DeletePod(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodDelete, c.podsURL()+"/"+url.PathEscape(name), nil, nil)
}

// ListPods returns the Pods matching a label selector.
//
// This is how the hub recovers its own state after a restart: sessions
// live in the cluster, not in the hub's memory, so a redeployed hub
// re-adopts running sessions instead of stranding them.
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
	// Bounded: an API server response is kilobytes, and an unbounded
	// read here would let a misrouted request exhaust the hub's memory.
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

// apiMessage pulls the human sentence out of a Status object. The API
// server explains refusals precisely ("pods is forbidden: User ... cannot
// create resource"), and losing that in favour of the status code turns a
// one-line RBAC fix into an investigation.
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
