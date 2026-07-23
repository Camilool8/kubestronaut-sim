// Package allow implements the docs-domain allowlist: a host matches when
// it equals an allowed domain or is a subdomain of one (whole-label match,
// so "kubernetes.io" never matches "evilkubernetes.io").
package allow

import (
	"net"
	"strings"
)

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
