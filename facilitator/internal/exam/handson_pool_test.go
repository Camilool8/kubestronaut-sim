package exam

import (
	"os"
	"strings"
	"testing"
)

func writeFixture(t *testing.T, path, doc string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
}

const (
	handsOnPoolExamJSON = "testdata/exam-handson-pool.json"
	handsOnPoolBankDir  = "testdata/bank-handson-pool"
)

func loadHandsOnPool(t *testing.T) *Exam {
	t.Helper()
	e, err := Load(handsOnPoolExamJSON, handsOnPoolBankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return e
}

func TestLoadHandsOnPoolIsPooled(t *testing.T) {
	e := loadHandsOnPool(t)

	if e.Type != TypeHandsOn {
		t.Fatalf("Type = %q, want %q", e.Type, TypeHandsOn)
	}
	if e.ExamLength != 3 {
		t.Errorf("ExamLength = %d, want 3", e.ExamLength)
	}
	if !Pooled(e) {
		t.Errorf("Pooled = false, want true for a 3-of-6 hands-on bank")
	}
	if len(e.Questions) != 6 {
		t.Errorf("len(Questions) = %d, want the full 6-question pool", len(e.Questions))
	}
}

func TestLoadHandsOnWithoutExamLengthIsNotPooled(t *testing.T) {
	e, err := Load("testdata/exam.json", "testdata/bank")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if Pooled(e) {
		t.Errorf("Pooled = true for a bank that declares no spec.examLength")
	}

	res, err := Draw(e, DrawOptions{})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if len(res.IDs) != len(e.Questions) {
		t.Fatalf("drew %d of %d questions; an unpooled hands-on bank draws all of them",
			len(res.IDs), len(e.Questions))
	}
	for i, q := range e.Questions {
		if res.IDs[i] != q.ID {
			t.Fatalf("IDs[%d] = %q, want %q — an unpooled draw is the bank, in bank order",
				i, res.IDs[i], q.ID)
		}
	}
}

func TestDrawHandsOnPoolIsStratified(t *testing.T) {
	e := loadHandsOnPool(t)

	byDomain := map[string]string{}
	for _, q := range e.Questions {
		byDomain[q.ID] = q.Domain
	}

	for _, seed := range []string{"000000", "a1b2c3", "ffffff", "0f0f0f", "123456"} {
		res, err := Draw(e, DrawOptions{Seed: seed})
		if err != nil {
			t.Fatalf("Draw(seed=%s): %v", seed, err)
		}
		if len(res.IDs) != 3 {
			t.Fatalf("seed %s drew %d questions, want 3", seed, len(res.IDs))
		}
		counts := map[string]int{}
		seen := map[string]bool{}
		for _, id := range res.IDs {
			if seen[id] {
				t.Errorf("seed %s drew %q twice", seed, id)
			}
			seen[id] = true
			counts[byDomain[id]]++
		}
		if counts["Domain A"] != 2 || counts["Domain B"] != 1 {
			t.Errorf("seed %s drew %v, want 2 from Domain A and 1 from Domain B", seed, counts)
		}
	}
}

func TestDrawHandsOnPoolReplaysBySeed(t *testing.T) {
	e := loadHandsOnPool(t)

	first, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (first): %v", err)
	}
	second, err := Draw(e, DrawOptions{Seed: "a1b2c3"})
	if err != nil {
		t.Fatalf("Draw (second): %v", err)
	}
	if !equalIDs(first.IDs, second.IDs) {
		t.Errorf("same seed drew different sets:\n first  = %v\n second = %v", first.IDs, second.IDs)
	}
	if first.PoolDigest != second.PoolDigest || first.PoolDigest == "" {
		t.Errorf("pool digests = %q / %q, want one non-empty shared fingerprint",
			first.PoolDigest, second.PoolDigest)
	}
}

func TestPoolDigestHandsOnTracksThePool(t *testing.T) {
	e := loadHandsOnPool(t)
	before := PoolDigest(e)
	if before == "" {
		t.Fatal("PoolDigest is empty for a pooled hands-on bank")
	}
	if err := CheckPool(e, before); err != nil {
		t.Errorf("CheckPool against its own digest: %v", err)
	}

	trimmed := *e
	trimmed.Questions = e.Questions[:len(e.Questions)-1]
	if after := PoolDigest(&trimmed); after == before {
		t.Errorf("digest %q survived a question being retired", after)
	}
	if err := CheckPool(&trimmed, before); err == nil {
		t.Error("CheckPool accepted a digest from a pool that has since changed")
	}
}

func TestDrawHandsOnPoolWithDomainFilter(t *testing.T) {
	e := loadHandsOnPool(t)

	res, err := Draw(e, DrawOptions{Seed: "a1b2c3", Domains: []string{"Domain B"}})
	if err != nil {
		t.Fatalf("Draw: %v", err)
	}
	if len(res.IDs) != 2 {
		t.Fatalf("drew %d questions from a 2-question domain, want both", len(res.IDs))
	}
	for _, id := range res.IDs {
		if id != "q05" && id != "q06" {
			t.Errorf("drew %q, which is not in Domain B", id)
		}
	}
	if len(res.Domains) != 1 || res.Domains[0] != "Domain B" {
		t.Errorf("Domains = %v, want the filter echoed back", res.Domains)
	}
}

func TestLoadRejectsExamLengthBeyondTheHandsOnPool(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/exam.json"
	writeFixture(t, path, `{
  "metadata": {"name": "too-long"},
  "spec": {
    "examType": "hands-on", "duration": "60m",
    "domainWeights": {"Domain A": 100},
    "examLength": 9,
    "questions": [
      {"id": "q01", "instance": "instance-1", "domain": "Domain A", "weight": 4}
    ]
  }
}`)

	_, err := Load(path, handsOnPoolBankDir)
	if err == nil {
		t.Fatal("Load accepted spec.examLength 9 against a 1-question pool")
	}
	if !strings.Contains(err.Error(), "exceeds the pool") {
		t.Errorf("error = %v, want it to name the pool it exceeds", err)
	}
}

func TestLoadRejectsNegativeExamLength(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/exam.json"
	writeFixture(t, path, `{
  "metadata": {"name": "negative"},
  "spec": {
    "examType": "mcq", "duration": "10m",
    "domainWeights": {"Domain A": 100},
    "examLength": -3,
    "questions": [
      {"id": "q01", "domain": "Domain A", "multi": false,
       "options": ["a", "b", "c"], "correct": [0]}
    ]
  }
}`)

	_, err := Load(path, handsOnPoolBankDir)
	if err == nil {
		t.Fatal("Load accepted a negative spec.examLength")
	}
	if !strings.Contains(err.Error(), "negative") {
		t.Errorf("error = %v, want it to say the length is negative", err)
	}
}
