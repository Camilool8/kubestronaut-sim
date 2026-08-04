package session

import (
	"encoding/json"
	"errors"
	"fmt"
)

// Template is a Pod manifest, as JSON, that the hub stamps out once per
// session.
//
// JSON rather than YAML because nothing in this repo may add a
// dependency, and the standard library has no YAML parser. Converting is
// a one-liner with a tool every operator of this already has:
//
//	kubectl apply --dry-run=client -o json -f deploy/helm/kubestronaut-sim/files/session-pod.yaml
//
// and the Helm chart does it at render time with fromYaml | toJson. So
// the manifest in the chart's files/ stays the single source of truth,
// comments and all, and no second copy of the spec exists to drift.
type Template []byte

// patch is what varies between one session and the next. Everything else
// — every container, capability, volume and probe — comes from the
// template untouched, which is the point: the hub does not model a
// PodSpec and cannot silently disagree with the manifest that was
// debugged against a real cluster.
type patch struct {
	Name   string
	Labels map[string]string
	Bank   string
	// WebhookURL and WebhookToken are how this session's graded attempts
	// reach a store that outlives it. Per-session, because the token
	// names the candidate: the Pod cannot say whose history it is
	// writing, it can only present the ticket it was given.
	WebhookURL   string
	WebhookToken string
}

// render returns the template with the session's identity and bank
// substituted.
//
// The manifest is decoded to map[string]any rather than to typed structs
// so that fields this package has never heard of survive the round trip.
// encoding/json discards unknown fields into a struct, which for a Pod
// spec means a field added to session-pod.yaml would be silently dropped
// on the way to the API server — the failure would be a session missing a
// volume, not a compile error.
func (t Template) render(p patch) ([]byte, error) {
	if len(t) == 0 {
		return nil, errors.New("session: no pod template configured")
	}
	var pod map[string]any
	if err := json.Unmarshal(t, &pod); err != nil {
		return nil, fmt.Errorf("session: pod template is not JSON: %w", err)
	}
	if kind, _ := pod["kind"].(string); kind != "Pod" {
		return nil, fmt.Errorf("session: pod template is a %q, want a Pod", kind)
	}

	meta, _ := pod["metadata"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
		pod["metadata"] = meta
	}
	meta["name"] = p.Name
	// A template carrying generateName as well would have the API server
	// ignore the name we just set.
	delete(meta, "generateName")
	labels, _ := meta["labels"].(map[string]any)
	if labels == nil {
		labels = map[string]any{}
		meta["labels"] = labels
	}
	for k, v := range p.Labels {
		labels[k] = v
	}

	if p.Bank != "" {
		// BANK appears in four containers and the init container, and a
		// session that sets it in three of them is a session where the
		// docs proxy allows one bank's sites while the facilitator serves
		// another's questions. Set wherever it already appears rather
		// than in a hardcoded list of container names.
		n, err := setEverywhere(pod, "BANK", p.Bank)
		if err != nil {
			return nil, err
		}
		if n == 0 {
			return nil, fmt.Errorf("session: no container in the template takes a BANK env var, so %q cannot be selected", p.Bank)
		}
	}

	if p.WebhookURL != "" {
		n, err := setEverywhere(pod, "HISTORY_WEBHOOK_URL", p.WebhookURL)
		if err != nil {
			return nil, err
		}
		if n == 0 {
			// Loud, for the same reason BANK is: a hub configured to
			// collect history against a template with nowhere to put the
			// endpoint would run perfectly and quietly record nothing,
			// and the candidate would find out after their exam.
			return nil, errors.New("session: no container in the template takes a HISTORY_WEBHOOK_URL env var, so attempts could not be recorded")
		}
		if _, err := setEverywhere(pod, "HISTORY_WEBHOOK_TOKEN", p.WebhookToken); err != nil {
			return nil, err
		}
	}

	return json.Marshal(pod)
}

// setEverywhere rewrites name in every container that already declares
// it, and reports how many it found.
func setEverywhere(pod map[string]any, name, value string) (int, error) {
	spec, _ := pod["spec"].(map[string]any)
	if spec == nil {
		return 0, errors.New("session: pod template has no spec")
	}
	n := 0
	for _, key := range []string{"initContainers", "containers"} {
		list, _ := spec[key].([]any)
		for _, c := range list {
			container, _ := c.(map[string]any)
			if container == nil {
				continue
			}
			n += setEnv(container, name, value)
		}
	}
	return n, nil
}

// setEnv rewrites an existing BANK entry in place and reports whether it
// found one. Only existing entries: a container that was not given a bank
// under compose does not want one here either, and adding it would be
// this package inventing spec the manifest never declared.
func setEnv(container map[string]any, name, value string) int {
	env, _ := container["env"].([]any)
	found := 0
	for _, e := range env {
		entry, _ := e.(map[string]any)
		if entry == nil {
			continue
		}
		if n, _ := entry["name"].(string); n == name {
			entry["value"] = value
			// valueFrom and value are mutually exclusive; a template that
			// sourced BANK from elsewhere would now have both.
			delete(entry, "valueFrom")
			found++
		}
	}
	return found
}
