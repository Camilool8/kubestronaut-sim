package auth

import (
	"crypto/hmac"
	"crypto/sha256"
)

// Derive returns a signing key for one purpose, from the single secret
// the hub is configured with.
//
// It exists so a credential minted for one job cannot be spent on
// another. The session Pod's history ticket carries a user id and is
// signed by the same package that signs login cookies; signed with the
// same key it would BE a login cookie, and a ticket read out of a Pod
// spec would become that candidate's session. A ticket signed with a
// derived key does not verify against the cookie key, in either
// direction, and no second secret has to be configured and rotated to
// get that.
//
// HMAC rather than a hash of the concatenation: this is a key, and
// keyed-prefix constructions are what HMAC exists to make safe.
func Derive(key []byte, purpose string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(purpose))
	return m.Sum(nil)
}

// PurposeIngest signs the tickets session Pods post their graded
// attempts back with.
const PurposeIngest = "history-ingest"
