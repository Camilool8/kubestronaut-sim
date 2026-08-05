package api

import (
	"net/http"

	"kubestronaut-sim/hub/internal/session"
)

// The device fact a client declares about itself, and the one rule that
// reads it.
//
// A hands-on attempt is a question panel beside a live Linux desktop
// over VNC. It needs a physical keyboard and room for two panes, and a
// phone has neither — so a hands-on seat granted to one is a seat nobody
// can use, a Pod boot nobody benefits from, and, when the pool is full,
// a queue place taken from a candidate who could have sat the exam. The
// refusal belongs here, before any of that is spent, rather than on the
// screen the candidate reaches twenty minutes later.
//
// The client measures this because no server can. A pointer type is not
// on the wire, and a User-Agent is a string the browser chooses: desktop
// mode on a phone walks straight through one, and a handful of laptops
// are turned away by it. See ui/src/lib/deviceCapability.ts.
const pointerHeader = "X-Sim-Pointer"

// touchOnly reports whether the caller said it has no precise pointer.
//
// An absent or unrecognised header is NOT touch-only, deliberately.
// `./sim`, tests/smoke.sh and every curl POST send no header at all and
// must keep working unchanged, and so must an older SPA. That leaves a
// hole, and it is the same hole the session-state gates have: this is
// UX fidelity, not security (see PRODUCT.md). The claim it supports is
// "a mobile browser will not start one", not "nothing can".
func touchOnly(r *http.Request) bool {
	return r.Header.Get(pointerHeader) == "coarse"
}

// refuseTouchOnlyPractical writes the refusal and reports true when this
// request must not be allowed to start or rebuild a hands-on exam.
//
// 409 rather than 400: the body is fine and the route is right. What
// conflicts is the state of the thing making the request, which is the
// same reason the "environment is still starting" refusal is a 409.
func refuseTouchOnlyPractical(w http.ResponseWriter, r *http.Request, kind session.Kind) bool {
	if kind != session.Practical || !touchOnly(r) {
		return false
	}
	writeErrorCode(w, http.StatusConflict, codeDesktopRequired,
		"this exam runs a Linux desktop beside the questions, so it needs a desktop browser and a keyboard")
	return true
}
