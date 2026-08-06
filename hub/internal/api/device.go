package api

import (
	"net/http"

	"kubestronaut-sim/hub/internal/session"
)

const pointerHeader = "X-Sim-Pointer"

func touchOnly(r *http.Request) bool {
	return r.Header.Get(pointerHeader) == "coarse"
}

func refuseTouchOnlyPractical(w http.ResponseWriter, r *http.Request, kind session.Kind) bool {
	if kind != session.Practical || !touchOnly(r) {
		return false
	}
	writeErrorCode(w, http.StatusConflict, codeDesktopRequired,
		"this exam runs a Linux desktop beside the questions, so it needs a desktop browser and a keyboard")
	return true
}
