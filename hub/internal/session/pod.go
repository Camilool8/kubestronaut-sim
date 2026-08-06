package session

import (
	"encoding/json"
	"errors"
	"fmt"
)

type Template []byte

type patch struct {
	Name   string
	Labels map[string]string
	Bank   string

	WebhookURL   string
	WebhookToken string
}

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

			return nil, errors.New("session: no container in the template takes a HISTORY_WEBHOOK_URL env var, so attempts could not be recorded")
		}
		if _, err := setEverywhere(pod, "HISTORY_WEBHOOK_TOKEN", p.WebhookToken); err != nil {
			return nil, err
		}
	}

	return json.Marshal(pod)
}

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

			delete(entry, "valueFrom")
			found++
		}
	}
	return found
}
