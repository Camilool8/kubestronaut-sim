package session

import (
	"encoding/json"
	"strings"
	"testing"
)

const twoContainers = `{
  "apiVersion": "v1",
  "kind": "Pod",
  "metadata": {"name": "placeholder", "labels": {"app.kubernetes.io/name": "kubestronaut-sim"}},
  "spec": {
    "restartPolicy": "Never",
    "hostAliases": [{"ip": "127.0.0.2", "hostnames": ["instance-1"]}],
    "initContainers": [
      {"name": "banks", "image": "banks:dev", "env": [{"name": "BANK", "value": "old"}]}
    ],
    "containers": [
      {"name": "k8s-env", "image": "k8s-env:dev", "env": [{"name": "BANK", "value": "old"}, {"name": "SSHD_LISTEN", "value": "127.0.0.1"}]},
      {"name": "docs-proxy", "image": "proxy:dev", "env": [{"name": "BANK", "value": "old"}]},
      {"name": "registry", "image": "registry:2"}
    ]
  }
}`

func render(t *testing.T, tmpl string, p patch) map[string]any {
	t.Helper()
	out, err := Template(tmpl).render(p)
	if err != nil {
		t.Fatal(err)
	}
	var pod map[string]any
	if err := json.Unmarshal(out, &pod); err != nil {
		t.Fatal(err)
	}
	return pod
}

func TestRenderNamesAndLabelsThePod(t *testing.T) {
	pod := render(t, twoContainers, patch{
		Name:   "sim-session-practical-583231",
		Labels: map[string]string{"kubestronaut-sim/user": "583231"},
	})
	meta := pod["metadata"].(map[string]any)
	if meta["name"] != "sim-session-practical-583231" {
		t.Errorf("name = %v", meta["name"])
	}
	labels := meta["labels"].(map[string]any)
	if labels["kubestronaut-sim/user"] != "583231" {
		t.Errorf("user label = %v", labels["kubestronaut-sim/user"])
	}
	// Patching labels must add to the template's, not replace them.
	if labels["app.kubernetes.io/name"] != "kubestronaut-sim" {
		t.Error("the template's own labels were dropped")
	}
}

// The sharp one. BANK appears in four containers plus the init
// container, and a render that sets it in three of them gives the
// candidate a docs proxy allowing one exam's sites while the facilitator
// serves another's questions — a session that looks fine and is wrong.
func TestRenderSetsBankInEveryContainerThatTakesOne(t *testing.T) {
	pod := render(t, twoContainers, patch{Name: "p", Bank: "ckad-mock-02"})
	spec := pod["spec"].(map[string]any)

	seen := 0
	for _, key := range []string{"initContainers", "containers"} {
		for _, c := range spec[key].([]any) {
			container := c.(map[string]any)
			env, _ := container["env"].([]any)
			for _, e := range env {
				entry := e.(map[string]any)
				if entry["name"] != "BANK" {
					continue
				}
				seen++
				if entry["value"] != "ckad-mock-02" {
					t.Errorf("%s: BANK = %v", container["name"], entry["value"])
				}
			}
		}
	}
	if seen != 3 {
		t.Errorf("set BANK in %d places, want 3", seen)
	}
	// A container with no BANK does not acquire one: the hub patches the
	// manifest, it does not invent spec the manifest never declared.
	for _, c := range spec["containers"].([]any) {
		container := c.(map[string]any)
		if container["name"] == "registry" {
			if _, has := container["env"]; has {
				t.Error("registry gained an env block it never had")
			}
		}
	}
}

// The reason the template is decoded to map[string]any rather than to a
// typed PodSpec: a field this package has never heard of must reach the
// API server. Into a struct, encoding/json discards it silently, and the
// symptom would be a session missing a volume rather than a build error.
func TestRenderPreservesFieldsThisPackageDoesNotKnow(t *testing.T) {
	out, err := Template(twoContainers).render(patch{Name: "p", Bank: "b"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"hostAliases", "instance-1", "restartPolicy", "SSHD_LISTEN", "127.0.0.2"} {
		if !strings.Contains(string(out), want) {
			t.Errorf("rendered pod lost %q", want)
		}
	}
}

func TestRenderRejectsWhatItCannotUse(t *testing.T) {
	for name, tc := range map[string]struct {
		tmpl string
		want string
	}{
		"not a pod":      {`{"kind":"Deployment","metadata":{}}`, "want a Pod"},
		"not json":       {"kind: Pod\n", "not JSON"},
		"empty":          {"", "no pod template"},
		"nowhere to set": {`{"kind":"Pod","metadata":{},"spec":{"containers":[{"name":"x"}]}}`, "BANK"},
	} {
		_, err := Template(tc.tmpl).render(patch{Name: "p", Bank: "b"})
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%s: err = %v, want it to mention %q", name, err, tc.want)
		}
	}
}

// generateName wins over name at the API server, so a template carrying
// both would produce Pods the hub cannot address by the name it thinks
// it gave them.
func TestRenderDropsGenerateName(t *testing.T) {
	pod := render(t, `{"kind":"Pod","metadata":{"generateName":"sim-"},"spec":{"containers":[]}}`,
		patch{Name: "sim-session-mcq-1"})
	meta := pod["metadata"].(map[string]any)
	if _, has := meta["generateName"]; has {
		t.Error("generateName survived and would override the name")
	}
	if meta["name"] != "sim-session-mcq-1" {
		t.Errorf("name = %v", meta["name"])
	}
}

func TestPodNameSafe(t *testing.T) {
	for in, want := range map[string]string{
		"583231":                "583231",
		"Octo_Cat":              "octo-cat",
		"user@example.com":      "user-example-com",
		"---":                   "anon",
		"":                      "anon",
		strings.Repeat("a", 60): strings.Repeat("a", 40),
	} {
		if got := podNameSafe(in); got != want {
			t.Errorf("podNameSafe(%q) = %q, want %q", in, got, want)
		}
	}
}
