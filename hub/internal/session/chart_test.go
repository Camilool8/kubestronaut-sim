package session

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestTheChartRendersSomethingThisPackageCanStampOut(t *testing.T) {
	paths := os.Getenv("SESSION_POD_JSON")
	if paths == "" {
		t.Skip("SESSION_POD_JSON unset — render the chart and point this at the result")
	}
	for _, path := range strings.Split(paths, ":") {
		t.Run(path, func(t *testing.T) {
			b, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			out, err := Template(b).render(patch{
				Name:         "sim-session-practical-583231",
				Labels:       map[string]string{"kubestronaut-sim/user": "583231"},
				Bank:         "a-bank-that-is-not-the-default",
				WebhookURL:   "https://hub.example/hub/ingest/history",
				WebhookToken: "ticket",
			})
			if err != nil {
				t.Fatalf("the hub cannot render this chart's pod: %v", err)
			}

			var pod map[string]any
			if err := json.Unmarshal(out, &pod); err != nil {
				t.Fatal(err)
			}
			meta := pod["metadata"].(map[string]any)
			if meta["name"] != "sim-session-practical-583231" {
				t.Errorf("name = %v", meta["name"])
			}

			if meta["namespace"] == nil || meta["namespace"] == "" {
				t.Error("the chart's namespace did not survive rendering")
			}

			spec := pod["spec"].(map[string]any)
			want := map[string]string{
				"BANK":                  "a-bank-that-is-not-the-default",
				"HISTORY_WEBHOOK_URL":   "https://hub.example/hub/ingest/history",
				"HISTORY_WEBHOOK_TOKEN": "ticket",
			}
			seen := map[string]int{}
			for _, key := range []string{"initContainers", "containers"} {
				list, _ := spec[key].([]any)
				for _, c := range list {
					container := c.(map[string]any)
					env, _ := container["env"].([]any)
					for _, e := range env {
						entry := e.(map[string]any)
						name, _ := entry["name"].(string)
						v, ok := want[name]
						if !ok {
							continue
						}
						seen[name]++
						if entry["value"] != v {
							t.Errorf("%v: %s = %v, want %q", container["name"], name, entry["value"], v)
						}
					}
				}
			}
			for name := range want {
				if seen[name] == 0 {
					t.Errorf("no container declares %s, so the hub had nowhere to put it", name)
				}
			}

			if strings.Contains(string(out), ":dev\"") {
				t.Error("a rendered image still points at :dev — images.tag did not reach it")
			}
		})
	}
}
