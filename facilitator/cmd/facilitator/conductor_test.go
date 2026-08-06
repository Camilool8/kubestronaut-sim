package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestConductorEndpointOverTCPIsUnchanged(t *testing.T) {
	u, rt, err := conductorEndpoint("conductor:9000")
	if err != nil {
		t.Fatal(err)
	}
	if got := u.String(); got != "http://conductor:9000" {
		t.Errorf("base URL = %q", got)
	}

	if rt != nil {
		t.Errorf("TCP endpoint built a transport: %T", rt)
	}
}

func TestConductorEndpointOverASocketReachesTheConductor(t *testing.T) {
	path := filepath.Join(t.TempDir(), "c.sock")
	ln, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	var gotHost, gotPath string
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost, gotPath = r.Host, r.URL.Path
		w.Write([]byte(`[{"id":"ckad-mock-01"}]`))
	}))
	srv.Listener.Close()
	srv.Listener = ln
	srv.Start()
	defer srv.Close()

	base, rt, err := conductorEndpoint(unixPrefix + path)
	if err != nil {
		t.Fatal(err)
	}
	body, err := newBanksFetcher(base, rt)(t.Context())
	if err != nil {
		t.Fatalf("bank list over the socket: %v", err)
	}
	if string(body) != `[{"id":"ckad-mock-01"}]` {
		t.Errorf("body = %s", body)
	}
	if gotPath != "/api/control/banks" {
		t.Errorf("path = %q", gotPath)
	}

	if gotHost != socketHost {
		t.Errorf("Host = %q, want %q", gotHost, socketHost)
	}
}

func TestConductorEndpointRejectsASocketWithNoPath(t *testing.T) {
	_, _, err := conductorEndpoint(unixPrefix)
	if err == nil || !strings.Contains(err.Error(), "no socket path") {
		t.Errorf("err = %v", err)
	}
}
