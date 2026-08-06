package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var Dist embed.FS

func FS() fs.FS {
	sub, err := fs.Sub(Dist, "dist")
	if err != nil {

		panic("web: " + err.Error())
	}
	return sub
}
