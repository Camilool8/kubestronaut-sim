package exam

import (
	"os"
	"strings"
	"testing"
)

// writeFixture drops a literal exam JSON document at path.
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

// loadHandsOnPool loads the pooled hands-on fixture: six questions, four
// in Domain A and two in Domain B, weighted 60/40, with
// spec.examLength: 3. Small enough to hand-verify, and every draw leaves
// half the pool out — which is the only interesting case, because a draw
// that happens to be the whole pool proves nothing about pooling.
func loadHandsOnPool(t *testing.T) *Exam {
	t.Helper()
	e, err := Load(handsOnPoolExamJSON, handsOnPoolBankDir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return e
}

// The opt-in itself. A hands-on bank that declares spec.examLength is
// pooled, and Load must carry the field through rather than treating it
// as an mcq-only key it can ignore.
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

// The other half of the opt-in, and the one that keeps every shipped
// bank byte-identically behaved: a hands-on bank with no
// spec.examLength is not pooled, whatever else is true of it.
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

// A pooled hands-on draw is stratified exactly as a pooled mcq one is:
// 60/40 of three questions is two from Domain A and one from Domain B,
// every time, not on average.
func TestDrawHandsOnPoolIsStratified(t *testing.T) {
	e := loadHandsOnPool(t)

	byDomain := map[string]string{}
	for _, q := range e.Questions {
		byDomain[q.ID] = q.Domain
	}

	// Every seed, not one: stratification is a promise about all of them.
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

// The replay contract, on the engine that never had one before: the same
// seed against the same pool draws the same hands-on questions in the
// same order. This is what makes a pooled hands-on attempt re-sittable —
// and what a candidate comparing two attempts relies on.
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

// A pooled hands-on bank fingerprints its pool the same way a pooled mcq
// one does — which is what makes the replay contract enforceable at
// grading time (CheckPool). Retiring a question has to move the digest,
// or a stale seed would silently grade an exam nobody sat.
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

// A domain filter narrows a pooled hands-on draw to that domain's own
// pool, and the whole filtered set is drawn when the declared length no
// longer fits inside it. The attempt is then shorter than the bank
// advertises, which is correct and is exactly why declaredQuestionCount
// prefers the draw over ex.ExamLength.
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

// A declared length its own pool cannot satisfy is an authoring bug, and
// the check is no longer mcq-only: a hands-on bank must fail to load for
// it too, at boot, rather than at the moment a candidate presses Start.
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

// A negative length used to be silently ignored ("length <= 0" reads as
// "no pooling"), which turned a typo into a bank that quietly stopped
// pooling. Nobody writes -3 on purpose.
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
