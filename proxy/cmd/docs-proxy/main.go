package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"kubestronaut-sim/proxy/internal/allow"
	"kubestronaut-sim/proxy/internal/server"
)

func main() {
	domains := os.Getenv("ALLOWED_DOMAINS")
	if domains == "" {
		domains = "kubernetes.io,helm.sh"
	}
	log.Printf("docs-proxy on :3128, allowed domains: %s", domains)
	srv := &http.Server{
		Addr:              ":3128",
		Handler:           server.New(allow.New(domains)),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
