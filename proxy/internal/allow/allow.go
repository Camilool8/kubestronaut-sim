// Package allow implements the docs-domain allowlist: a host matches when
// it equals an allowed domain or is a subdomain of one (whole-label match,
// so "kubernetes.io" never matches "evilkubernetes.io").
package allow

import (
	"net"
	"strings"
)

// DefaultDomains is the allowlist a bank inherits when it declares no
// allowedDomains of its own. It is the smallest set that makes the two
// documentation sites actually usable:
//
//   - kubernetes.io covers the docs, the blog and the versioned
//     v1-NN.docs.kubernetes.io archives (subdomains match).
//   - code.jquery.com is a hard dependency, not a nicety: kubernetes.io's
//     main.min.js is one big jQuery IIFE, so blocking it throws before
//     the search box, tab panes and sidebar toggle are ever wired up.
//   - the font hosts serve the typeface the docs are designed in.
//   - helm.sh's search is Algolia-hosted and has no local fallback, so
//     its read hosts and their retry aliases have to be reachable.
//
// Deliberately absent: analytics (www.googletagmanager.com), and Google
// Programmable Search. kubernetes.io probes whether Google is reachable
// and falls back to Pagefind — a search index it serves itself — when
// it isn't. Letting that probe fail is both simpler and closer to the
// real exam, where using the docs search is allowed but opening
// external search results is not.
const DefaultDomains = "kubernetes.io,helm.sh,code.jquery.com," +
	"fonts.googleapis.com,fonts.gstatic.com,algolia.net,algolianet.com"

// List is a set of allowed domains for host matching.
type List struct{ domains []string }

// New parses a comma-separated list of domains into a List, lowercasing
// each entry, trimming whitespace and dots, and dropping empty entries.
func New(commaSeparated string) *List {
	l := &List{}
	for _, d := range strings.Split(commaSeparated, ",") {
		d = strings.ToLower(strings.Trim(strings.TrimSpace(d), "."))
		if d != "" {
			l.domains = append(l.domains, d)
		}
	}
	return l
}

// Host reports whether hostport's host (with an optional ":port" suffix)
// is an allowed domain or a subdomain of one.
func (l *List) Host(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if host == "" {
		return false
	}
	for _, d := range l.domains {
		if host == d || strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}
