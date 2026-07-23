package server

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"kubestronaut-sim/proxy/internal/allow"
)

// startProxy returns the proxy's listen address.
func startProxy(t *testing.T, domains string) string {
	t.Helper()
	srv := httptest.NewServer(New(allow.New(domains)))
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	return u.Host
}

func TestConnectBlocked(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n")
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("CONNECT to blocked host: got %d, want 403", resp.StatusCode)
	}
}

func TestConnectAllowedTunnels(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "hello-tunnel")
	}))
	defer backend.Close()
	bu, _ := url.Parse(backend.URL)

	addr := startProxy(t, "127.0.0.1")
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", bu.Host, bu.Host)
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("CONNECT to allowed host: got %d, want 200", resp.StatusCode)
	}
	// speak plain HTTP through the tunnel
	fmt.Fprintf(conn, "GET / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", bu.Host)
	body, _ := io.ReadAll(br)
	if !strings.Contains(string(body), "hello-tunnel") {
		t.Fatalf("tunnel did not reach backend, got: %q", body)
	}
}

func TestPlainHTTPProxy(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "plain-ok")
	}))
	defer backend.Close()

	addr := startProxy(t, "127.0.0.1")
	proxyURL, _ := url.Parse("http://" + addr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get(backend.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || string(body) != "plain-ok" {
		t.Fatalf("got %d %q", resp.StatusCode, body)
	}
}

func TestPlainHTTPProxyStripsHopByHopHeaders(t *testing.T) {
	var sawProxyConnection, sawKeepAlive bool
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawProxyConnection = r.Header.Get("Proxy-Connection") != ""
		sawKeepAlive = r.Header.Get("Keep-Alive") != ""
		io.WriteString(w, "plain-ok")
	}))
	defer backend.Close()

	addr := startProxy(t, "127.0.0.1")
	proxyURL, _ := url.Parse("http://" + addr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	req, err := http.NewRequest(http.MethodGet, backend.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Proxy-Connection", "keep-alive")
	req.Header.Set("Keep-Alive", "timeout=5")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body)

	if sawProxyConnection {
		t.Fatal("backend received Proxy-Connection header, want it stripped by proxy")
	}
	if sawKeepAlive {
		t.Fatal("backend received Keep-Alive header, want it stripped by proxy")
	}
}

func TestPlainHTTPBlocked(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	proxyURL, _ := url.Parse("http://" + addr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get("http://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("got %d, want 403", resp.StatusCode)
	}
}

func TestNonProxyRequestRejected(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	resp, err := http.Get("http://" + addr + "/relative")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", resp.StatusCode)
	}
}
