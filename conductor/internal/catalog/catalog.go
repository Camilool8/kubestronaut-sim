// Package catalog builds the exam catalog the UI's lobby renders. Bank
// definitions arrive as JSON (the conductor's entrypoint pre-converts
// each banks/<id>/exam.yaml with yq — the Go binary never parses YAML,
// matching every other service in the stack), plus one _catalog.json of
// coming-soon entries whose engine doesn't exist yet.
package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// bankIDPattern is the only shape a bank id may take; anything else is
// rejected before it can ever reach a filesystem path or command.
var bankIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// allowedInstances is the fixed compose topology every runnable bank
// must fit (see docs/bank-spec.md).
var allowedInstances = map[string]bool{"instance-1": true, "instance-2": true}

// Entry is one catalog row, JSON-shaped for the /api/control/banks
// response.
type Entry struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Certification     string `json:"certification,omitempty"`
	Description       string `json:"description,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds,omitempty"`
	PassingScore      int    `json:"passingScore,omitempty"`
	KubernetesVersion string `json:"kubernetesVersion,omitempty"`
	QuestionCount     int    `json:"questionCount,omitempty"`
	Available         bool   `json:"available"`
	ComingSoon        bool   `json:"comingSoon,omitempty"`
	Note              string `json:"note,omitempty"`
}

// Catalog is an immutable set of entries loaded once at startup (banks
// are a read-only mount; new banks require a conductor restart).
type Catalog struct {
	entries map[string]Entry
}

// bankDoc mirrors the yq-converted exam.yaml fields the catalog needs.
type bankDoc struct {
	Metadata struct {
		Name          string `json:"name"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
		Description   string `json:"description"`
	} `json:"metadata"`
	Spec struct {
		ExamType          string `json:"examType"`
		Duration          string `json:"duration"`
		PassingScore      int    `json:"passingScore"`
		KubernetesVersion string `json:"kubernetesVersion"`
		Instances         []struct {
			Name string `json:"name"`
		} `json:"instances"`
		Questions []struct {
			ID string `json:"id"`
		} `json:"questions"`
	} `json:"spec"`
}

// comingSoonDoc mirrors _catalog.json.
type comingSoonDoc struct {
	ComingSoon []struct {
		ID            string `json:"id"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
		ExamType      string `json:"examType"`
		Note          string `json:"note"`
	} `json:"comingSoon"`
}

// Load reads every *.json bank document in dir plus the optional
// _catalog.json. Individually invalid documents are skipped with a
// stderr note — one broken bank must not take the whole catalog down.
func Load(dir string) (*Catalog, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, fmt.Errorf("catalog: glob %s: %w", dir, err)
	}

	c := &Catalog{entries: map[string]Entry{}}
	for _, p := range paths {
		base := strings.TrimSuffix(filepath.Base(p), ".json")
		raw, err := os.ReadFile(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "catalog: read %s: %v (skipped)\n", p, err)
			continue
		}
		if base == "_catalog" {
			c.mergeComingSoon(p, raw)
			continue
		}
		entry, err := buildEntry(base, raw)
		if err != nil {
			fmt.Fprintf(os.Stderr, "catalog: %s: %v (skipped)\n", p, err)
			continue
		}
		c.entries[entry.ID] = entry
	}
	return c, nil
}

func (c *Catalog) mergeComingSoon(path string, raw []byte) {
	var doc comingSoonDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		fmt.Fprintf(os.Stderr, "catalog: parse %s: %v (skipped)\n", path, err)
		return
	}
	for _, cs := range doc.ComingSoon {
		if _, exists := c.entries[cs.ID]; exists {
			continue // a real bank with this id wins
		}
		c.entries[cs.ID] = Entry{
			ID:            cs.ID,
			Title:         cs.Title,
			Certification: cs.Certification,
			ExamType:      cs.ExamType,
			Available:     false,
			ComingSoon:    true,
			Note:          cs.Note,
		}
	}
}

func buildEntry(id string, raw []byte) (Entry, error) {
	var doc bankDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return Entry{}, fmt.Errorf("parse: %w", err)
	}
	if doc.Metadata.Name != "" && doc.Metadata.Name != id {
		return Entry{}, fmt.Errorf("metadata.name %q != bank dir %q", doc.Metadata.Name, id)
	}

	examType := doc.Spec.ExamType
	if examType == "" {
		examType = "hands-on" // v1alpha1 banks predate the field
	}

	entry := Entry{
		ID:                id,
		Title:             doc.Metadata.Title,
		Certification:     doc.Metadata.Certification,
		Description:       doc.Metadata.Description,
		ExamType:          examType,
		PassingScore:      doc.Spec.PassingScore,
		KubernetesVersion: doc.Spec.KubernetesVersion,
		QuestionCount:     len(doc.Spec.Questions),
		Available:         true,
	}
	if d, err := time.ParseDuration(doc.Spec.Duration); err == nil {
		entry.DurationSeconds = int(d.Seconds())
	}

	if !bankIDPattern.MatchString(id) {
		entry.Available = false
		entry.Note = "bank id is not a valid slug"
		return entry, nil
	}
	if examType != "hands-on" {
		entry.Available = false
		if entry.Note == "" {
			entry.Note = fmt.Sprintf("exam type %q has no engine yet", examType)
		}
		return entry, nil
	}
	if len(doc.Spec.Instances) == 0 || len(doc.Spec.Instances) > len(allowedInstances) {
		entry.Available = false
		entry.Note = "bank must declare 1-2 instances"
		return entry, nil
	}
	for _, inst := range doc.Spec.Instances {
		if !allowedInstances[inst.Name] {
			entry.Available = false
			entry.Note = fmt.Sprintf("instance %q is outside the fixed instance-1/instance-2 topology", inst.Name)
			return entry, nil
		}
	}
	return entry, nil
}

// List returns all entries, available first, then by id — a stable
// order for the UI.
func (c *Catalog) List() []Entry {
	out := make([]Entry, 0, len(c.entries))
	for _, e := range c.entries {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Available != out[j].Available {
			return out[i].Available
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// Get returns one entry by id.
func (c *Catalog) Get(id string) (Entry, bool) {
	e, ok := c.entries[id]
	return e, ok
}

// Switchable reports whether id names a bank a switch operation may
// target, with a caller-facing reason when it may not.
func (c *Catalog) Switchable(id string) error {
	if !bankIDPattern.MatchString(id) {
		return fmt.Errorf("invalid bank id")
	}
	e, ok := c.entries[id]
	if !ok {
		return fmt.Errorf("unknown bank %q", id)
	}
	if !e.Available {
		reason := e.Note
		if reason == "" {
			reason = "bank is not available"
		}
		return fmt.Errorf("bank %q cannot be activated: %s", id, reason)
	}
	return nil
}
