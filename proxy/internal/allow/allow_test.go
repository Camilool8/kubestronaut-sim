package allow

import "testing"

func TestHost(t *testing.T) {
	l := New("kubernetes.io, helm.sh")
	cases := []struct {
		host string
		want bool
	}{
		{"kubernetes.io", true},
		{"kubernetes.io:443", true},
		{"docs.kubernetes.io", true},
		{"KUBERNETES.IO:443", true},
		{"kubernetes.io.", true},
		{"helm.sh:443", true},
		{"evilkubernetes.io", false},
		{"kubernetes.io.evil.com", false},
		{"example.com:443", false},
		{"", false},
	}
	for _, c := range cases {
		if got := l.Host(c.host); got != c.want {
			t.Errorf("Host(%q) = %v, want %v", c.host, got, c.want)
		}
	}
}

func TestHostEmptyList(t *testing.T) {
	if New("").Host("kubernetes.io") {
		t.Error("empty allowlist must block everything")
	}
}

// The default list is a functional contract, not a preference: each
// entry is there because something on the documentation sites breaks
// without it, and the omissions are deliberate.
func TestDefaultDomainsMakeTheDocsUsableWithoutOpeningTheWeb(t *testing.T) {
	l := New(DefaultDomains)

	mustAllow := map[string]string{
		"kubernetes.io":               "the docs themselves",
		"v1-34.docs.kubernetes.io":    "the version switcher (subdomain match)",
		"code.jquery.com":             "kubernetes.io's main.min.js is a jQuery IIFE; without it search never wires up",
		"helm.sh":                     "the Helm docs",
		"AYED2EXU9K-dsn.algolia.net":  "helm.sh search has no local fallback",
		"AYED2EXU9K-1.algolianet.com": "algolia retry host",
		"fonts.gstatic.com":           "the typeface the docs are set in",
	}
	for host, why := range mustAllow {
		if !l.Host(host) {
			t.Errorf("Host(%q) = false, want true — %s", host, why)
		}
	}

	mustBlock := map[string]string{
		"www.googletagmanager.com": "analytics, not needed to read the docs",
		"cse.google.com":           "Google search would return external results; kubernetes.io falls back to its own Pagefind index",
		"www.google.com":           "the exam allows the docs search, not the open web",
		"github.com":               "not on the Linux Foundation's allowed-resources list",
		"example.com":              "everything else",
	}
	for host, why := range mustBlock {
		if l.Host(host) {
			t.Errorf("Host(%q) = true, want false — %s", host, why)
		}
	}

	// Known and accepted: matching is host-granular and includes
	// subdomains, so allowing kubernetes.io also allows
	// discuss.kubernetes.io, which the real exam disallows. Excluding it
	// would need a deny-override the proxy does not have. Asserted so
	// the gap stays visible rather than being rediscovered later.
	if !l.Host("discuss.kubernetes.io") {
		t.Error("subdomain matching changed; the documented gap above is now fixable")
	}
}
