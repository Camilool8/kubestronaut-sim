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
	// PoolCount is how many questions the bank AUTHORS; QuestionCount is
	// how many one attempt draws. They differ only for a pooled bank, and
	// the exam card renders the pair ("65 / 97") only when they do — a
	// card reading "22 / 22" would advertise a pool that is not one.
	//
	// The facilitator already knows this for the ACTIVE bank (its
	// /api/exam serves the full question list), but the catalog is the
	// only place that knows it for the others, and the exam selector
	// draws every bank side by side.
	PoolCount  int    `json:"poolCount,omitempty"`
	Available  bool   `json:"available"`
	ComingSoon bool   `json:"comingSoon,omitempty"`
	Note       string `json:"note,omitempty"`

	// Hidden keeps a bank out of List — and therefore out of the lobby —
	// without making it unswitchable. It exists for exactly one caller:
	// tests/smoke.sh needs a second real bank to switch to so the whole
	// switch path (write-bank, recreate-cluster, restart-facilitator,
	// verify) stays covered, and the only alternative was keeping a
	// 2-question "CKA Mock Exam" in the catalog that PRODUCT.md already
	// warns must never read as complete.
	//
	// Never serialised: the UI has no use for it and no business
	// discovering the fixture exists.
	Hidden bool `json:"-"`

	// QuestionIDs backs HasQuestion, which is what stops a client-supplied
	// question id reaching a shell command. Not serialised — the UI gets
	// the question list from the facilitator's /api/exam.
	QuestionIDs []string `json:"-"`
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
		Hidden        bool   `json:"hidden"`
	} `json:"metadata"`
	Spec struct {
		ExamType          string `json:"examType"`
		Duration          string `json:"duration"`
		PassingScore      int    `json:"passingScore"`
		KubernetesVersion string `json:"kubernetesVersion"`
		// ExamLength is a pooled bank's declared draw size — see
		// docs/bank-spec.md. The catalog card must show this, not the
		// size of the full authored pool behind it. Read for both engines:
		// a hands-on bank that declares it seeds the drawn subset when the
		// attempt starts rather than the whole pool at boot.
		ExamLength int `json:"examLength"`
		Instances  []struct {
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

// declaredQuestionCount mirrors the facilitator's own
// (*server).declaredQuestionCount: a pooled bank's card shows its draw
// size, not the full authored pool behind it. examLength <= 0 or >=
// poolSize means no pooling, exactly as exam.Pooled treats it.
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
		QuestionCount:     declaredQuestionCount(doc.Spec.ExamLength, len(doc.Spec.Questions)),
		PoolCount:         len(doc.Spec.Questions),
		Available:         true,
		Hidden:            doc.Metadata.Hidden,
	}
	for _, q := range doc.Spec.Questions {
		entry.QuestionIDs = append(entry.QuestionIDs, q.ID)
	}
	if d, err := time.ParseDuration(doc.Spec.Duration); err == nil {
		entry.DurationSeconds = int(d.Seconds())
	}

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
		// An mcq bank grades in the facilitator, not over ssh; declaring
		// instances is an authoring mistake, not something to silently
		// ignore.
		if len(doc.Spec.Instances) > 0 {
			entry.Available = false
			entry.Note = "mcq banks declare no instances"
			return entry, nil
		}
	default:
		entry.Available = false
		if entry.Note == "" {
			entry.Note = fmt.Sprintf("exam type %q has no engine yet", examType)
		}
		return entry, nil
	}
	return entry, nil
}

// List returns all entries the lobby should show, available first, then
// by id — a stable order for the UI.
//
// Hidden entries are filtered here and ONLY here: Get and Switchable
// deliberately still see them, so a test fixture stays a valid switch
// target while never appearing as an exam anyone could pick.
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

// HasQuestion reports whether bank declares a question with this id.
//
// This is the allowlist that makes a client-supplied question id safe to
// interpolate into a path: not "does it look like an id" but "is it one
// of these exact strings". Reseed pairs it with a pattern check, because
// defence in depth is cheap and a shell command is the wrong place to
// find out you were wrong.
func (c *Catalog) HasQuestion(bank, qid string) bool {
	e, ok := c.entries[bank]
	if !ok {
		return false
	}
	for _, id := range e.QuestionIDs {
		if id == qid {
			return true
		}
	}
	return false
}
