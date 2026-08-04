package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// unixPrefix marks a CONDUCTOR_ADDR value as a filesystem socket rather
// than a host:port. It matches the conductor's own LISTEN convention
// (conductor/cmd/conductor/main.go), so one value describes both ends.
const unixPrefix = "unix:"

// socketHost is the host every socket-dialed request carries.
//
// A URL needs one and net/http will not send a request without it, but
// nothing resolves it: the transport below ignores the address it is
// handed and dials the path instead. Named rather than "localhost" so a
// log line or a proxy header says where the request really went.
const socketHost = "conductor"

// conductorEndpoint resolves CONDUCTOR_ADDR into the base URL every
// conductor client is built from, and the RoundTripper that reaches it.
//
// Two transports because there are two deployments. Under compose the
// conductor is on `controlnet`, an `internal: true` network the exam
// containers are not attached to, and plain TCP is already private. In
// a hosted session the whole stack is one Pod: one network namespace,
// shared loopback, and a candidate with a shell on an instance could
// curl the control API directly. A unix socket cannot be reached across
// a namespace it is not mounted into, which is the property TCP lost.
//
// A nil RoundTripper means http.DefaultTransport, which is what the TCP
// case wants and what every test gets.
func conductorEndpoint(addr string) (*url.URL, http.RoundTripper, error) {
	path, isSocket := strings.CutPrefix(addr, unixPrefix)
	if !isSocket {
		u, err := url.Parse("http://" + addr)
		if err != nil {
			return nil, nil, fmt.Errorf("parse CONDUCTOR_ADDR: %w", err)
		}
		return u, nil, nil
	}
	if path == "" {
		return nil, nil, fmt.Errorf("parse CONDUCTOR_ADDR: %q has no socket path", addr)
	}
	var d net.Dialer
	return &url.URL{Scheme: "http", Host: socketHost}, &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return d.DialContext(ctx, "unix", path)
		},
	}, nil
}
