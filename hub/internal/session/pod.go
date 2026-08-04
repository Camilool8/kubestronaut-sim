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
//	kubectl apply --dry-run=client -o json -f deploy/session-pod.yaml
//
// and the Helm chart does it at render time with fromYaml | toJson. So
// deploy/session-pod.yaml stays the single source of truth, comments and
// all, and no second copy of the spec exists to drift.
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
		spec, _ := pod["spec"].(map[string]any)
		if spec == nil {
			return nil, errors.New("session: pod template has no spec")
		}
		// BANK appears in four containers and the init container, and a
		// session that sets it in three of them is a session where the
		// docs proxy allows one bank's sites while the facilitator serves
		// another's questions. Set wherever it already appears rather
		// than in a hardcoded list of container names.
		n := 0
		for _, key := range []string{"initContainers", "containers"} {
			list, _ := spec[key].([]any)
			for _, c := range list {
				container, _ := c.(map[string]any)
				if container == nil {
					continue
				}
				n += setEnv(container, "BANK", p.Bank)
			}
		}
		if n == 0 {
			return nil, fmt.Errorf("session: no container in the template takes a BANK env var, so %q cannot be selected", p.Bank)
		}
	}

	return json.Marshal(pod)
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
