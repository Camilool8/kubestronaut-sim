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
