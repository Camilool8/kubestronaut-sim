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

var bankIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

var allowedInstances = map[string]bool{"instance-1": true, "instance-2": true}

type Entry struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Certification     string `json:"certification,omitempty"`
	Description       string `json:"description,omitempty"`
	ExamType          string `json:"examType"`
	DurationSeconds   int    `json:"durationSeconds,omitempty"`
	PassingScore      int    `json:"passingScore,omitempty"`
	KubernetesVersion string `json:"kubernetesVersion,omitempty"`

	QuestionCount int `json:"questionCount,omitempty"`
	PoolCount     int `json:"poolCount,omitempty"`

	Nodes      int    `json:"nodes,omitempty"`
	Available  bool   `json:"available"`
	ComingSoon bool   `json:"comingSoon,omitempty"`
	Note       string `json:"note,omitempty"`

	Hidden bool `json:"-"`
}

type Catalog struct {
	entries map[string]Entry
}

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

type comingSoonDoc struct {
	ComingSoon []struct {
		ID            string `json:"id"`
		Title         string `json:"title"`
		Certification string `json:"certification"`
		ExamType      string `json:"examType"`
		Note          string `json:"note"`
	} `json:"comingSoon"`
}

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

func (c *Catalog) Get(id string) (Entry, bool) {
	e, ok := c.entries[id]
	return e, ok
}

func (c *Catalog) Len() int { return len(c.entries) }

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
		examType = "hands-on"
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
