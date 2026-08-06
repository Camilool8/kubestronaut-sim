package server

import (
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"kubestronaut-sim/proxy/internal/allow"
)

func New(list *allow.List) http.Handler {
	return &proxy{list: list}
}

type proxy struct{ list *allow.List }

var hopByHopHeaders = []string{
	"Connection",
	"Proxy-Connection",
	"Keep-Alive",
	"Proxy-Authenticate",
	"Proxy-Authorization",
	"TE",
	"Trailer",
	"Transfer-Encoding",
	"Upgrade",
}

func stripHopByHop(h http.Header) {
	for _, f := range h.Values("Connection") {
		for _, name := range strings.Split(f, ",") {
			name = strings.TrimSpace(name)
			if name != "" {
				h.Del(name)
			}
		}
	}
	for _, name := range hopByHopHeaders {
		h.Del(name)
	}
}

func (p *proxy) deny(w http.ResponseWriter, host string) {
	log.Printf("blocked host=%s", host)
	http.Error(w, "blocked by exam docs allowlist", http.StatusForbidden)
}

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
		p.deny(w, r.Host)
		return
	}
	outReq := r.Clone(r.Context())
	outReq.RequestURI = ""
	stripHopByHop(outReq.Header)
	resp, err := http.DefaultTransport.RoundTrip(outReq)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	stripHopByHop(resp.Header)
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
		p.deny(w, r.Host)
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
	src, brw, err := hj.Hijack()
	if err != nil {
		dst.Close()
		return
	}
	defer src.Close()
	defer dst.Close()

	if _, err := src.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		return
	}

	if n := brw.Reader.Buffered(); n > 0 {
		if _, err := io.CopyN(dst, brw.Reader, int64(n)); err != nil {
			return
		}
	}

	done := make(chan struct{})
	go func() {
		io.Copy(dst, src)
		halfClose(dst)
		close(done)
	}()
	io.Copy(src, dst)
	halfClose(src)
	<-done
}

func halfClose(conn net.Conn) {
	if cw, ok := conn.(interface{ CloseWrite() error }); ok {
		cw.CloseWrite()
		return
	}
	conn.Close()
}
