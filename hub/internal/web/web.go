// Package web embeds the built exam UI (Vite + React static assets) into
// the hub binary.
//
// The facilitator embeds the same bundle and serves it to a candidate who
// has a session Pod. The hub needs its own copy for the window before
// that is true: sign-in, the lobby, the queue and the boot screen are all
// screens of this SPA, and until one of them has started a session there
// is no Pod to serve it from. A hub that only proxied would answer a
// first-time visitor with a JSON error, and the screen that would have
// let them fix that is inside the Pod they cannot yet have.
//
// Once a session is running the proxy takes over, so a candidate mid-exam
// is served by their own Pod. The two copies are the same build: both
// images are produced from one tag by one workflow.
//
// dist/index.html is committed as a placeholder ("UI not built — use the
// Docker image.") so `go build`/`go test` succeed without running the node
// build; the image's multi-stage Dockerfile overwrites dist/ with the
// actual Vite build output before compiling the Go binary.
package web

import (
	"embed"
	"io/fs"
)

// Dist embeds every file under dist/, including dotfiles (the "all:"
// pattern), so a real Vite build's hashed asset filenames and any hidden
// config files it emits are never silently excluded.
//
//go:embed all:dist
var Dist embed.FS

// FS returns the embedded UI's file tree rooted at dist/ (i.e. with the
// "dist" path prefix stripped), ready to be served directly as an
// http.FileServer/http.Dir-style root.
func FS() fs.FS {
	sub, err := fs.Sub(Dist, "dist")
	if err != nil {
		// Dist is embedded from the literal "dist" directory at build
		// time, so Sub can only fail here if that path constant itself
		// were wrong — a build-time programming error, not a runtime
		// condition callers should ever need to handle.
		panic("web: " + err.Error())
	}
	return sub
}
