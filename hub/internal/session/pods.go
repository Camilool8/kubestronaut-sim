package session

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"kubestronaut-sim/hub/internal/kube"
)

// KubePods adapts the Kubernetes client to what the manager needs.
//
// The whole reason this is a separate type is the sentinel translation.
// The manager decides "already gone, carry on" and "name taken, wait for
// it" by errors.Is against its own sentinels; a kube.ErrNotFound that
// reaches it untranslated reads as an unknown failure, and the visible
// symptom is a reset that waits out its entire timeout for a Pod that
// vanished immediately. One adapter, one test.
type KubePods struct {
	Client         *kube.Client
	ReadyContainer string
}

var _ Pods = (*KubePods)(nil)

func (k *KubePods) Create(ctx context.Context, spec []byte) error {
	_, err := k.Client.CreatePod(ctx, spec)
	if errors.Is(err, kube.ErrConflict) {
		return fmt.Errorf("%w", ErrPodExists)
	}
	return err
}

func (k *KubePods) Get(ctx context.Context, name string) (Pod, error) {
	p, err := k.Client.GetPod(ctx, name)
	if errors.Is(err, kube.ErrNotFound) {
		return Pod{}, ErrPodGone
	}
	if err != nil {
		return Pod{}, err
	}
	return k.convert(p), nil
}

func (k *KubePods) Delete(ctx context.Context, name string) error {
	err := k.Client.DeletePod(ctx, name)
	if errors.Is(err, kube.ErrNotFound) {
		return ErrPodGone
	}
	return err
}

func (k *KubePods) List(ctx context.Context, selector string) ([]Pod, error) {
	pods, err := k.Client.ListPods(ctx, selector)
	if err != nil {
		return nil, err
	}
	out := make([]Pod, 0, len(pods))
	for _, p := range pods {
		out = append(out, k.convert(p))
	}
	return out, nil
}

func (k *KubePods) convert(p kube.Pod) Pod {
	return Pod{
		Name:        p.Metadata.Name,
		IP:          p.Status.PodIP,
		Phase:       p.Status.Phase,
		Ready:       p.Ready(k.ReadyContainer),
		Terminating: p.Terminating(),
		CreatedAt:   p.Metadata.CreationTimestamp,
		Labels:      p.Metadata.Labels,
	}
}

// Static is a Pods implementation with no Kubernetes behind it: every
// session it hands out resolves to one fixed host.
//
// It exists so the hub — auth, seats, the queue, holds, reaping, the
// proxy and the recycle job protocol — can be run against a local
// `./sim up`, which is the only place the whole simulator runs without a
// cluster. It really does track existence, so a recycle deletes, waits,
// and creates exactly as it would against an API server; what it cannot
// do is rebuild anything, so the facilitator on the other side is the
// same one as before. That difference is the point of saying "static"
// rather than "fake": the lifecycle is real, the teardown is not.
type Static struct {
	// Host is where every session's traffic goes. The manager appends
	// the configured port.
	Host string

	mu   sync.Mutex
	live map[string]time.Time
}

var _ Pods = (*Static)(nil)

func (s *Static) Create(_ context.Context, spec []byte) error {
	var pod struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(spec, &pod); err != nil {
		return fmt.Errorf("static: unreadable pod spec: %w", err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.live == nil {
		s.live = map[string]time.Time{}
	}
	if _, exists := s.live[pod.Metadata.Name]; exists {
		return ErrPodExists
	}
	s.live[pod.Metadata.Name] = time.Now()
	return nil
}

func (s *Static) Get(_ context.Context, name string) (Pod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	created, ok := s.live[name]
	if !ok {
		return Pod{}, ErrPodGone
	}
	return Pod{
		Name: name, IP: s.Host, Phase: "Running", Ready: true, CreatedAt: created,
		Labels: map[string]string{"kubestronaut-sim/user": ""},
	}, nil
}

func (s *Static) Delete(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.live[name]; !ok {
		return ErrPodGone
	}
	delete(s.live, name)
	return nil
}

// List returns nothing: a hub restart has nothing to adopt here, because
// the Pods only ever existed in this process's memory.
func (s *Static) List(context.Context, string) ([]Pod, error) { return nil, nil }
