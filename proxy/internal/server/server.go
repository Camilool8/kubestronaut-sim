// Package server is a forward HTTP proxy that only relays to allowlisted
// hosts: CONNECT tunnels for HTTPS, plain proxying for HTTP. No TLS
// interception.
package server

import (
	"io"
	"log"
	"net"
	"net/http"
	"time"

	"kubestronaut-sim/proxy/internal/allow"
)

func New(list *allow.List) http.Handler {
	return &proxy{list: list}
}

type proxy struct{ list *allow.List }

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.connect(w, r)
		return
	}
	if !r.URL.IsAbs() {
		http.Error(w, "docs-proxy: not a proxy request", http.StatusBadRequest)
		return
	}
	if !p.list.Host(r.Host) {
		log.Printf("blocked host=%s", r.Host)
		http.Error(w, "blocked by exam docs allowlist", http.StatusForbidden)
		return
	}
	r.RequestURI = ""
	resp, err := http.DefaultTransport.RoundTrip(r)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (p *proxy) connect(w http.ResponseWriter, r *http.Request) {
	if !p.list.Host(r.Host) {
		log.Printf("blocked host=%s", r.Host)
		http.Error(w, "blocked by exam docs allowlist", http.StatusForbidden)
		return
	}
	dst, err := net.DialTimeout("tcp", r.Host, 10*time.Second)
	if err != nil {
		http.Error(w, "upstream dial failed", http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		dst.Close()
		http.Error(w, "hijacking unsupported", http.StatusInternalServerError)
		return
	}
	src, _, err := hj.Hijack()
	if err != nil {
		dst.Close()
		return
	}
	src.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	go func() {
		io.Copy(dst, src)
		dst.Close()
	}()
	io.Copy(src, dst)
	src.Close()
}
