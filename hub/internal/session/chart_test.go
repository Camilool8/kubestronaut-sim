package session

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// The gate between the chart and this package.
//
// Everything else in pod_test.go exercises render() against templates
// written for the test. This one runs it against the real thing: the
// JSON `helm template` actually produces from
// deploy/helm/kubestronaut-sim/files/*.yaml. Without it the two halves
// are only checked separately — helm proves the manifest is valid YAML,
// the tests prove render() handles a Pod, and nobody proves the hub can
// stamp out the specific Pod this chart ships.
//
// The failure it exists to catch is quiet and late: a manifest that
// stops declaring HISTORY_WEBHOOK_URL, or a chart change that renames a
// container, produces a hub that starts, serves, admits a candidate, and
// then returns 500 the moment they press start.
//
// Fed by SESSION_POD_JSON, a colon-separated list of rendered files, and
// skipped when it is unset — the module must stay testable with nothing
// but `go test`, and helm is not a Go dependency. CI renders the chart
// and sets it; see the chart step in .github/workflows/ci.yml.
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
			// The chart sets a namespace and the hub must not lose it: a
			// create whose body names a different namespace from the URL
			// is a 400 from the API server, and an empty one is worse —
			// it defaults, silently, to whichever namespace the hub is in.
			if meta["namespace"] == nil || meta["namespace"] == "" {
				t.Error("the chart's namespace did not survive rendering")
			}

			// Every value the hub is responsible for filling in reached
			// every container that declares it. A miss here is a session
			// that boots and is wrong rather than one that fails.
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

			// Nothing left pointing at a tag the release workflow does not
			// publish. `:dev` is what the manifest carries so it can be
			// applied by hand; a chart render that still says it means the
			// image rewrite silently matched nothing.
			if strings.Contains(string(out), ":dev\"") {
				t.Error("a rendered image still points at :dev — images.tag did not reach it")
			}
		})
	}
}
