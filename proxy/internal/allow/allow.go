// Package allow implements the docs-domain allowlist: a host matches when
// it equals an allowed domain or is a subdomain of one (whole-label match,
// so "kubernetes.io" never matches "evilkubernetes.io").
package allow

import (
	"net"
	"strings"
)

type List struct{ domains []string }

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
