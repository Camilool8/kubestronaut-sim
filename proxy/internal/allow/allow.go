package allow

import (
	"net"
	"strings"
)

const DefaultDomains = "kubernetes.io,helm.sh,code.jquery.com," +
	"fonts.googleapis.com,fonts.gstatic.com,algolia.net,algolianet.com"

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
