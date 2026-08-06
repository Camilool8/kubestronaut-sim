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

	if labels["app.kubernetes.io/name"] != "kubestronaut-sim" {
		t.Error("the template's own labels were dropped")
	}
}

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

	for _, c := range spec["containers"].([]any) {
		container := c.(map[string]any)
		if container["name"] == "registry" {
			if _, has := container["env"]; has {
				t.Error("registry gained an env block it never had")
			}
		}
	}
}

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

const withWebhook = `{
  "kind": "Pod",
  "metadata": {},
  "spec": {"containers": [
    {"name": "facilitator", "env": [
      {"name": "BANK", "value": "old"},
      {"name": "HISTORY_WEBHOOK_URL", "value": ""},
      {"name": "HISTORY_WEBHOOK_TOKEN", "value": ""}
    ]},
    {"name": "conductor", "env": [{"name": "BANK", "value": "old"}]}
  ]}
}`

func TestRenderSetsTheWebhookOnTheContainerThatDeclaresIt(t *testing.T) {
	pod := render(t, withWebhook, patch{
		Name:         "p",
		Bank:         "ckad-mock-01",
		WebhookURL:   "https://hub.example/hub/ingest/history",
		WebhookToken: "tkt",
	})
	containers := pod["spec"].(map[string]any)["containers"].([]any)

	env := map[string]any{}
	for _, e := range containers[0].(map[string]any)["env"].([]any) {
		entry := e.(map[string]any)
		env[entry["name"].(string)] = entry["value"]
	}
	if env["HISTORY_WEBHOOK_URL"] != "https://hub.example/hub/ingest/history" {
		t.Errorf("URL = %v", env["HISTORY_WEBHOOK_URL"])
	}
	if env["HISTORY_WEBHOOK_TOKEN"] != "tkt" {
		t.Errorf("token = %v", env["HISTORY_WEBHOOK_TOKEN"])
	}

	for _, e := range containers[1].(map[string]any)["env"].([]any) {
		if name := e.(map[string]any)["name"]; name != "BANK" {
			t.Errorf("conductor gained %v", name)
		}
	}
}

func TestRenderRefusesAWebhookTheTemplateCannotTake(t *testing.T) {
	_, err := Template(twoContainers).render(patch{
		Name:       "p",
		WebhookURL: "https://hub.example/hub/ingest/history",
	})
	if err == nil || !strings.Contains(err.Error(), "HISTORY_WEBHOOK_URL") {
		t.Errorf("err = %v", err)
	}
}

func TestRenderWithNoWebhookLeavesTheTemplateAlone(t *testing.T) {
	pod := render(t, withWebhook, patch{Name: "p", Bank: "b"})
	for _, e := range pod["spec"].(map[string]any)["containers"].([]any)[0].(map[string]any)["env"].([]any) {
		entry := e.(map[string]any)
		if strings.HasPrefix(entry["name"].(string), "HISTORY_WEBHOOK") && entry["value"] != "" {
			t.Errorf("%v = %v with no webhook configured", entry["name"], entry["value"])
		}
	}
}

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
