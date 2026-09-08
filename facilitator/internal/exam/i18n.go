package exam

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// DefaultLanguage is what a bank is written in when spec.language is
// absent. Every bank in this repository before translations existed was
// English, so absent means English rather than "unknown".
const DefaultLanguage = "en"

// A language code is a BCP-47-shaped tag kept deliberately small: a
// two- or three-letter primary subtag with an optional region. It names
// a file on disk, so anything wider than this is a path, not a language.
var languageCode = regexp.MustCompile(`^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`)

// Translation is one question in one language: the stem and the
// explanation as markdown, and for an mcq question the options in the
// same order as exam.yaml, so a stored answer index means the same thing
// whichever language it was chosen in.
type Translation struct {
	Question string
	Options  []string
	Solution string
}

// TranslationPath is where a question's translation lives:
// banks/<bank>/<qid>/i18n/<lang>.md.
func TranslationPath(bankDir, qid, lang string) string {
	return filepath.Join(bankDir, qid, "i18n", lang+".md")
}

// Languages lists every language the bank can be sat in, the base
// language first.
func (e *Exam) Languages() []string {
	out := make([]string, 0, 1+len(e.Translations))
	out = append(out, e.Language)
	out = append(out, e.Translations...)
	return out
}

// HasLanguage reports whether an attempt can be started in lang. The
// empty string is the base language, so a client that never asks for
// one gets what it always got.
func (e *Exam) HasLanguage(lang string) bool {
	if lang == "" || lang == e.Language {
		return true
	}
	for _, t := range e.Translations {
		if t == lang {
			return true
		}
	}
	return false
}

// Translated reports whether lang asks for something other than the
// bank's own files.
func (e *Exam) Translated(lang string) bool {
	return lang != "" && lang != e.Language
}

var (
	headingQuestion = regexp.MustCompile(`(?mi)^##\s+Question\s*$`)
	headingOptions  = regexp.MustCompile(`(?mi)^##\s+Options\s*$`)
	headingSolution = regexp.MustCompile(`(?mi)^##\s+Solution\s*$`)
	anyHeading      = regexp.MustCompile(`(?mi)^##\s+(Question|Options|Solution)\s*$`)
)

// ReadTranslation parses one i18n file. The file is three sections under
// `## Question`, `## Options` (mcq only) and `## Solution`, in any order;
// options are one `- ` line each. It is read per request, like
// question.md, so an edit needs no restart; Load has already proved the
// file parses and its option count agrees with exam.yaml.
func ReadTranslation(bankDir, qid, lang string) (Translation, error) {
	path := TranslationPath(bankDir, qid, lang)
	raw, err := os.ReadFile(path)
	if err != nil {
		return Translation{}, fmt.Errorf("exam: %s has no %s translation: %w", qid, lang, err)
	}
	return ParseTranslation(string(raw), path)
}

// ParseTranslation is ReadTranslation on text already in hand.
func ParseTranslation(text, path string) (Translation, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	locs := anyHeading.FindAllStringIndex(text, -1)
	if len(locs) == 0 {
		return Translation{}, fmt.Errorf("exam: %s has no `## Question` / `## Solution` sections", path)
	}
	sections := map[string]string{}
	for i, loc := range locs {
		head := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(text[loc[0]:loc[1]], "##")))
		end := len(text)
		if i+1 < len(locs) {
			end = locs[i+1][0]
		}
		if _, dup := sections[head]; dup {
			return Translation{}, fmt.Errorf("exam: %s repeats the `## %s` section", path, head)
		}
		sections[head] = strings.TrimSpace(text[loc[1]:end])
	}

	tr := Translation{Question: sections["question"], Solution: sections["solution"]}
	if _, ok := sections["question"]; !ok || tr.Question == "" {
		return Translation{}, fmt.Errorf("exam: %s has no `## Question` section, or an empty one", path)
	}
	if _, ok := sections["solution"]; !ok || tr.Solution == "" {
		return Translation{}, fmt.Errorf("exam: %s has no `## Solution` section, or an empty one", path)
	}
	if opts, ok := sections["options"]; ok {
		for _, line := range strings.Split(opts, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if !strings.HasPrefix(line, "- ") {
				return Translation{}, fmt.Errorf("exam: %s: `## Options` holds %q, want one `- option` per line", path, line)
			}
			opt := strings.TrimSpace(strings.TrimPrefix(line, "- "))
			if opt == "" {
				return Translation{}, fmt.Errorf("exam: %s has an empty option line", path)
			}
			tr.Options = append(tr.Options, opt)
		}
	}
	return tr, nil
}

// validateTranslations is the load-time half of the contract: every
// declared language is a well-formed code, none repeats the base, and
// every question has a file for it that parses and, for mcq, carries
// exactly as many options as exam.yaml. A translation an attempt could
// be started in and then fail to serve mid-exam is worse than a bank
// that refuses to load.
func validateTranslations(e *Exam, bankDir string) error {
	if e.Language == "" {
		e.Language = DefaultLanguage
	}
	if !languageCode.MatchString(e.Language) {
		return fmt.Errorf("exam: spec.language %q is not a language code", e.Language)
	}
	seen := map[string]bool{e.Language: true}
	for _, lang := range e.Translations {
		if !languageCode.MatchString(lang) {
			return fmt.Errorf("exam: spec.translations entry %q is not a language code", lang)
		}
		if seen[lang] {
			return fmt.Errorf("exam: spec.translations lists %q twice, or it is the base language", lang)
		}
		seen[lang] = true
		for _, q := range e.Questions {
			tr, err := ReadTranslation(bankDir, q.ID, lang)
			if err != nil {
				return err
			}
			if e.Type == TypeMCQ && len(tr.Options) != len(q.Options) {
				return fmt.Errorf("exam: %s: %s translation has %d options, exam.yaml has %d",
					q.ID, lang, len(tr.Options), len(q.Options))
			}
		}
	}
	return nil
}
