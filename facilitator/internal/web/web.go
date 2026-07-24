// Package web embeds the built exam UI (Vite + React static assets) into
// the facilitator binary.
//
// dist/index.html is committed as a placeholder ("UI not built — use the
// Docker image.") so `go build`/`go test` succeed without running the
// node build; the real image's multi-stage Dockerfile overwrites
// dist/ with the actual Vite build output before compiling the Go
// binary.
package web

import (
	"embed"
	"io/fs"
)

// Dist embeds every file under dist/, including dotfiles (the "all:"
// pattern), so a real Vite build's hashed asset filenames and any
// hidden config files it emits are never silently excluded.
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
