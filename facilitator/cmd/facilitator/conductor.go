package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
)

const unixPrefix = "unix:"

const socketHost = "conductor"

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
