// Package catalog is the hub's list of exams, read once at startup from
// the bank index the banks image ships.
//
// It exists because of a timing problem that has no other answer: a
// candidate in the lobby is choosing which certification to sit, and
// until they have chosen there is no session Pod, so there is nothing
// running that could be asked what exams exist. The hub has to know by
// itself.
//
// It is a deliberate second implementation of the conductor's scan
// (conductor/internal/catalog), on the same precedent already recorded
// in docs/follow-ups.md for the hub re-implementing the facilitator's
// attempt rollup: the four Go modules never import one another, and the
// alternative — copying every bank's title, engine and question count
// into values.yaml — puts the same facts in two places, one of which
// nobody updates. This reads the bank itself, so it cannot say something
// the bank does not.
//
// What it deliberately does NOT do is the conductor's job. There is no
// Switchable, no question-id validation and no hidden-bank plumbing:
// nothing here ever reaches a shell command, and admission is the only
// decision made from it.
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

// bankIDPattern is the only shape a bank id may take. The hub stamps a
// bank into a Pod spec and into a label value, so a name that is not a
// slug is rejected before either.
var bankIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// allowedInstances is the fixed session topology every runnable hands-on
// bank must fit (see docs/bank-spec.md). Two shells, named, in every
// deployment: the compose file, the session Pod's hostAliases and its
// per-instance volumes all agree on it.
var allowedInstances = map[string]bool{"instance-1": true, "instance-2": true}

// Entry is one exam as the hosted lobby renders it.
//
// The JSON names match the local exam selector's `BankEntry` exactly,
// because the two screens show the same cards and the SPA reads them
// with one type. A field this hub cannot know is simply absent.
type Entry struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Certification     string `json:"certification,omitempty"`
	Description       string `json:"description,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds,omitempty"`
	PassingScore      int    `json:"passingScore,omitempty"`
	KubernetesVersion string `json:"kubernetesVersion,omitempty"`
	// QuestionCount is what one attempt asks; PoolCount is what the bank
	// authors. They differ only for a pooled bank, and the card prints
	// the pair only when they do.
	QuestionCount int `json:"questionCount,omitempty"`
	PoolCount     int `json:"poolCount,omitempty"`
	// Nodes is spec.environment.nodes: how big this exam's cluster is,
	// and the same number bootstrap.sh generates the kind config from.
	//
	// Carried so the hosted boot screen can describe the environment it
	// is actually building. It used to assert two nodes at everybody,
	// which was true only because CKAD was the only hands-on exam. Zero
	// means the bank declared none — every mcq bank, which has no
	// cluster — and the copy has to survive not knowing.
	Nodes      int    `json:"nodes,omitempty"`
	Available  bool   `json:"available"`
	ComingSoon bool   `json:"comingSoon,omitempty"`
	Note       string `json:"note,omitempty"`

	// Hidden keeps a bank out of the lobby without removing it from the
	// catalog. tests/smoke.sh's fixture bank sets it.
	Hidden bool `json:"-"`
}

// Catalog is an immutable set of entries. The banks are an image layer;
// a new bank is a new image and therefore a new hub Pod.
type Catalog struct {
	entries map[string]Entry
}

// bankDoc mirrors the fields this package needs out of a bank's
// yq-converted exam.yaml.
type bankDoc struct {
	Metadata struct {
		Name          string `json:"name"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
		Description   string `json:"description"`
		Hidden        bool   `json:"hidden"`
	} `json:"metadata"`
	Spec struct {
		ExamType          string `json:"examType"`
		Duration          string `json:"duration"`
		PassingScore      int    `json:"passingScore"`
		KubernetesVersion string `json:"kubernetesVersion"`
		ExamLength        int    `json:"examLength"`
		Environment       struct {
			Nodes int `json:"nodes"`
		} `json:"environment"`
		Instances []struct {
			Name string `json:"name"`
		} `json:"instances"`
		Questions []struct {
			ID string `json:"id"`
		} `json:"questions"`
	} `json:"spec"`
}

// comingSoonDoc mirrors _catalog.json: certifications advertised on the
// path whose bank is not written yet.
type comingSoonDoc struct {
	ComingSoon []struct {
		ID            string `json:"id"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
		ExamType      string `json:"examType"`
		Note          string `json:"note"`
	} `json:"comingSoon"`
}

// Load reads every *.json in dir plus the optional _catalog.json.
//
// A single unreadable or malformed bank is skipped with a note on
// stderr rather than failing the load: this runs at hub startup, and one
// bad bank must not take down the front door of the whole deployment.
// An empty or missing directory is an empty catalog, not an error — a
// deployment that has not staged the index yet still serves identity,
// history and its already-running sessions.
func Load(dir string) (*Catalog, error) {
	c := &Catalog{entries: map[string]Entry{}}
	if dir == "" {
		return c, nil
	}
	paths, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, fmt.Errorf("catalog: glob %s: %w", dir, err)
	}
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
		// A real bank directory with this id wins: the entry here is a
		// placeholder for something that does not exist yet, and the
		// moment it does exist the placeholder is stale.
		if _, exists := c.entries[cs.ID]; exists {
			continue
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

// List returns every non-hidden entry, available ones first and then by
// title, which is the order the lobby renders.
func (c *Catalog) List() []Entry {
	out := make([]Entry, 0, len(c.entries))
	for _, e := range c.entries {
		if e.Hidden {
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Available != out[j].Available {
			return out[i].Available
		}
		return out[i].Title < out[j].Title
	})
	return out
}

// Get returns the entry for a bank id, hidden ones included: the smoke
// fixture is startable by name even though it is not offered.
func (c *Catalog) Get(id string) (Entry, bool) {
	e, ok := c.entries[id]
	return e, ok
}

// Len reports how many exams were loaded, for the startup log.
func (c *Catalog) Len() int { return len(c.entries) }

// declaredQuestionCount mirrors the facilitator's own: a pooled bank's
// card shows its draw size, not the authored pool behind it.
func declaredQuestionCount(examLength, poolSize int) int {
	if examLength > 0 && examLength < poolSize {
		return examLength
	}
	return poolSize
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
		examType = "hands-on" // the facilitator's own default
	}

	entry := Entry{
		ID:                id,
		Title:             doc.Metadata.Title,
		Certification:     doc.Metadata.Certification,
		Description:       doc.Metadata.Description,
		ExamType:          examType,
		PassingScore:      doc.Spec.PassingScore,
		KubernetesVersion: doc.Spec.KubernetesVersion,
		QuestionCount:     declaredQuestionCount(doc.Spec.ExamLength, len(doc.Spec.Questions)),
		PoolCount:         len(doc.Spec.Questions),
		Nodes:             doc.Spec.Environment.Nodes,
		Available:         true,
		Hidden:            doc.Metadata.Hidden,
	}
	if d, err := time.ParseDuration(doc.Spec.Duration); err == nil {
		entry.DurationSeconds = int(d.Seconds())
	}

	// Everything below marks a bank unavailable rather than dropping it.
	// A candidate who can see that CKS exists and why it cannot be sat
	// has learnt something; a card that silently vanished has not.
	if !bankIDPattern.MatchString(id) {
		entry.Available = false
		entry.Note = "bank id is not a valid slug"
		return entry, nil
	}
	switch examType {
	case "hands-on":
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
	case "mcq":
		if len(doc.Spec.Instances) > 0 {
			entry.Available = false
			entry.Note = "mcq banks declare no instances"
			return entry, nil
		}
	default:
		entry.Available = false
		entry.Note = fmt.Sprintf("no engine for examType %q", examType)
		return entry, nil
	}
	if len(doc.Spec.Questions) == 0 {
		entry.Available = false
		entry.Note = "bank declares no questions"
	}
	return entry, nil
}
