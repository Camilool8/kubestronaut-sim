package api

import "net/http"

const pointerHeader = "X-Sim-Pointer"

const codeDesktopRequired = "desktop_required"

func touchOnly(r *http.Request) bool {
	return r.Header.Get(pointerHeader) == "coarse"
}
