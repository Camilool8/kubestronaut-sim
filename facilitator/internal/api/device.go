package api

import "net/http"

// The device fact a client declares about itself.
//
// This is the backstop, and the only guard every attempt passes through:
// local or hosted, deep-linked or resumed, every attempt begins at
// POST /api/session/start here. The hub has its own copy of this rule
// (hub/internal/api/device.go) because it can refuse *earlier* — before
// a seat and a Pod boot are spent — but it is not in the path of a local
// candidate at all.
//
// The client measures it because no server can: a pointer type is not on
// the wire, and a User-Agent is a string the browser chooses. See
// ui/src/lib/deviceCapability.ts.
const pointerHeader = "X-Sim-Pointer"

// codeDesktopRequired lets the SPA answer this with a screen rather than
// a toast, without matching on prose that will be reworded.
const codeDesktopRequired = "desktop_required"

// touchOnly reports whether the caller said it has no precise pointer.
//
// An absent or unrecognised header is NOT touch-only. `./sim`,
// tests/smoke.sh and every curl POST send no header and must keep
// working unchanged. Like the session-state gates, this is UX fidelity
// rather than security (PRODUCT.md): it stops a mobile browser starting
// an exam it cannot sit, and claims nothing stronger.
func touchOnly(r *http.Request) bool {
	return r.Header.Get(pointerHeader) == "coarse"
}
