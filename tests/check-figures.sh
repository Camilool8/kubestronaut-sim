#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Every published figure about an exam — pool size, draw size, clock,
# passing score, domain weights — is owned by that bank's exam.yaml. The
# prose that repeats one is checked here rather than trusted, because it
# has drifted before: issue #81 was four descriptions of the same bank
# disagreeing about how many questions it holds.
#
# A bank the gate has no claims for is a failure, not a skip. Silence is
# how a gate comes to prove nothing (issue #82), so the last thing this
# prints on success is the number of comparisons it actually made.

python3 - "$@" <<'PY'
import glob, json, os, re, sys

failures = []
compared = 0


def fail(msg):
    failures.append(msg)


def check(where, want, got, what):
    """One comparison against the owner. Counted whether it passes or not."""
    global compared
    compared += 1
    if want != got:
        fail(f"{where}: {what} reads {got!r}, exam.yaml says {want!r}")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def minutes(text):
    """A Go duration as whole minutes. Only the forms banks use."""
    m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?", text.strip())
    if not m or not any(m.groups()):
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def clock(mins):
    """The site's exam-card spelling of a duration: 120 -> 2h, 90 -> 1h 30m."""
    h, r = divmod(mins, 60)
    if not h:
        return f"{r}m"
    return f"{h}h" if not r else f"{h}h {r}m"


UNITS = ("zero one two three four five six seven eight nine ten eleven twelve "
         "thirteen fourteen fifteen sixteen seventeen eighteen nineteen").split()
TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ")


def spelled(n):
    """Small numbers as words, the way a bank's prose writes them."""
    if n < 20:
        return UNITS[n]
    tens, unit = divmod(n, 10)
    word = TENS[tens]
    return word if not unit else f"{word}-{UNITS[unit]}"


def field(text, key, pattern=r"\S+"):
    m = re.search(rf"^\s*{key}:\s*(?P<v>{pattern})\s*$", text, re.M)
    return m.group("v").strip().strip('"') if m else None


def domain_weights(text):
    m = re.search(r"^(\s*)domainWeights:\s*$", text, re.M)
    if not m:
        return {}
    indent = len(m.group(1))
    out = {}
    for line in text[m.end():].splitlines():
        if not line.strip():
            continue
        pad = len(line) - len(line.lstrip())
        if pad <= indent:
            break
        row = re.match(r"\s*(?P<name>.+?):\s*(?P<weight>\d+)\s*$", line)
        if row:
            out[row.group("name").strip()] = int(row.group("weight"))
    return out


banks = []
for path in sorted(glob.glob(os.path.join("banks", "*", "exam.yaml"))):
    text = read(path)
    head, _, spec = text.partition("\nspec:")
    if re.search(r"^\s*hidden:\s*true\s*$", head, re.M):
        continue

    duration = minutes(field(spec, "duration") or "")
    if duration is None:
        fail(f"{path}: spec.duration is missing or not in hours/minutes")
        continue
    speed = field(spec, "speedDuration")
    speed = minutes(speed) if speed else duration // 2
    if speed is None:
        fail(f"{path}: spec.speedDuration is not in hours/minutes")
        continue

    pool = len(re.findall(r"^\s*-\s+id:\s*\S+", spec, re.M))
    drawn = field(spec, "examLength", r"\d+")
    banks.append({
        "id": os.path.basename(os.path.dirname(path)),
        "title": field(head, "title", r".+"),
        "certification": field(head, "certification", r".+"),
        "examType": field(spec, "examType") or "hands-on",
        "pool": pool,
        "drawn": int(drawn) if drawn else pool,
        "duration": duration,
        "speed": speed,
        "passing": int(field(spec, "passingScore", r"\d+") or 0),
        "k8s": field(spec, "kubernetesVersion"),
        "domains": domain_weights(spec),
    })

if not banks:
    fail("found no listable bank under banks/ — the parse is wrong, and a "
         "gate with nothing to compare proves nothing")

ENGINE = {"hands-on": "Hands-on", "mcq": "Multiple choice"}


def cells(row):
    return [c.strip() for c in row.strip().strip("|").split("|")]


# ---------------------------------------------------------------- README.md
# The exam table. Matched by title and read cell by cell, so reordering the
# columns is not a failure but changing a figure is.
readme = read("README.md")
for bank in banks:
    rows = [r for r in re.findall(r"^\|.*\|$", readme, re.M)
            if bank["title"] in r]
    if len(rows) != 1:
        fail(f"README.md: {len(rows)} exam-table rows name {bank['title']!r}, "
             f"want exactly 1 — the table this gate checks has moved")
        continue
    got = cells(rows[0])
    for want, what in (
        (ENGINE.get(bank["examType"], bank["examType"]), "engine"),
        (str(bank["pool"]), "pool size"),
        (f"{bank['drawn']} drawn", "draw size"),
        (f"{bank['duration']} min", "clock"),
        (f"{bank['passing']}%", "passing score"),
    ):
        compared += 1
        if want not in got:
            fail(f"README.md: the {bank['title']} row has no {what} cell "
                 f"reading {want!r} (row: {got})")

# The README states no Kubernetes version of its own — it says the bank pins
# one — but a future edit that puts a number back must not be able to put a
# stale one back. Any version it names has to be one a bank actually declares.
pinned = {bank["k8s"] for bank in banks if bank["k8s"]}
for got in re.findall(r"Kubernetes (\d+\.\d+)", readme):
    compared += 1
    if got not in pinned:
        fail(f"README.md: names Kubernetes {got}, which no bank pins "
             f"(banks declare {sorted(pinned) or 'nothing'})")

# ----------------------------------------------------------- site/index.html
# The landing page's own figures. site/build.sh --check already pins the
# question totals and the drawn/pool stat; these are the ones it does not
# reach — the duration, the passing score, the domain weights, and the two
# clocks the mode table quotes per certification.
page = read("site/index.html")
flat = re.sub(r"\s+", " ", page)
cards = [c.split("</ul>")[0] for c in page.split('<li class="exam-card')[1:]]
if not cards:
    fail('site/index.html: no <li class="exam-card"> on the page — the parse '
         "is wrong")

for bank in banks:
    mine = [c for c in cards if f"<h4>{bank['title']}</h4>" in re.sub(r"\s+", " ", c)]
    if len(mine) != 1:
        fail(f"site/index.html: {len(mine)} exam cards are headed "
             f"{bank['title']!r}, want exactly 1")
        continue
    card = re.sub(r"\s+", " ", mine[0])

    compared += 1
    if f"<dd>{clock(bank['duration'])}</dd>" not in card:
        shown = re.findall(r"<dt>Duration</dt> ?<dd>(.*?)</dd>", card)
        fail(f"site/index.html: the {bank['title']} card shows a duration of "
             f"{shown or ['nothing']}, exam.yaml says {clock(bank['duration'])!r}")

    compared += 1
    if f"<dt>To pass</dt><dd>{bank['passing']}%</dd>" not in card.replace("> <", "><"):
        shown = re.findall(r"<dt>To pass</dt> ?<dd>(.*?)</dd>", card)
        fail(f"site/index.html: the {bank['title']} card says {shown or ['nothing']} "
             f"to pass, exam.yaml says {bank['passing']}%")

    # The Kubernetes minor, written out in the card's prose. A hands-on card
    # has to state one — it is describing a cluster — so a card that quietly
    # stopped naming a version is a failure, not a skip. tests/check-k8s-pins.sh
    # holds the machine-readable pins to each other; this holds the prose to
    # them, because that gate deliberately does not read English.
    stated = re.findall(r"Kubernetes (\d+\.\d+)", card)
    if bank["examType"] == "hands-on" and not stated:
        fail(f"site/index.html: the {bank['title']} card describes a cluster "
             f"without naming a Kubernetes version, so nothing holds the page "
             f"to exam.yaml's {bank['k8s']}")
    for got in stated:
        check("site/index.html", bank["k8s"], got,
              f"the {bank['title']} card's Kubernetes version")

    if not bank["domains"]:
        fail(f"{bank['id']}: exam.yaml declares no domainWeights, so the "
             f"weights the landing page prints cannot be checked")
    for domain, weight in bank["domains"].items():
        compared += 1
        if f"{domain} <b>{weight}%</b>" not in card:
            got = re.findall(rf"{re.escape(domain)} <b>(\d+)%</b>", card)
            fail(f"site/index.html: the {bank['title']} card weights "
                 f"{domain!r} at {got or ['nothing']}, exam.yaml says {weight}%")

modes = re.search(r'<table class="mode-table">.*?</table>', page, re.S)
if modes is None:
    fail('site/index.html: no <table class="mode-table"> — the mode table this '
         "gate checks has moved or gone")
else:
    table = re.sub(r"\s+", " ", modes.group(0))
    for bank in banks:
        cert = bank["certification"]
        if not cert or cert == "NONE":
            continue
        for mins, what in ((bank["speed"], "Mastery"), (bank["duration"], "Exam")):
            compared += 1
            if f"{mins} min {cert}" not in table:
                got = re.findall(rf"(\d+) min {re.escape(cert)}", table)
                fail(f"site/index.html: the mode table quotes {got or ['no']} "
                     f"minute clocks for {cert}, and none of them is the "
                     f"{what} clock of {mins} min")

# ---------------------------------------------------------------- docs/api.md
# The samples are parsed rather than grepped, and each figure is read off
# the object that carries the bank's own id. A whole-block search instead
# reads a session's draw of 10, or the other bank's row in the same
# catalog listing, as this bank's pool.
api = read("docs/api.md")
blocks = re.findall(r"```json\n(.*?)```", api, re.S)
if not blocks:
    fail("docs/api.md: no ```json sample blocks found — the parse is wrong")

by_id = {bank["id"]: bank for bank in banks}
seen = {bank["id"]: 0 for bank in banks}
unparsed = 0


def walk(node):
    """Every object in a sample that names a bank, checked in place."""
    if isinstance(node, list):
        for item in node:
            walk(item)
        return
    if not isinstance(node, dict):
        return
    bank = by_id.get(node.get("id"))
    if bank is not None:
        for key, want in (
            ("questionCount", bank["drawn"]),
            ("poolCount", bank["pool"]),
            ("durationSeconds", bank["duration"] * 60),
            ("passingScore", bank["passing"]),
            ("kubernetesVersion", bank["k8s"]),
        ):
            if key in node and want is not None:
                seen[bank["id"]] += 1
                check("docs/api.md", want, node[key], f"{bank['id']} {key}")
    for value in node.values():
        walk(value)


for block in blocks:
    try:
        walk(json.loads(block))
    except ValueError:
        # An elided sample such as `{"attempts": [ ... ]}` is prose, not a
        # figure. Counted so a page that stopped parsing entirely is loud.
        unparsed += 1

if unparsed == len(blocks):
    fail("docs/api.md: not one JSON sample parsed — the samples this gate "
         "reads have changed shape")
for bank in banks:
    if not seen[bank["id"]]:
        fail(f"docs/api.md: no JSON sample carries an object with "
             f'"id": "{bank["id"]}" and a figure on it, so nothing the page '
             f"documents about that bank is checked")

# ------------------------------------------------- the banks' own prose files
# A bank that ships a README or a tips page restates its own figures there.
# Optional files, so absence is not a failure — but a bank whose prose the
# gate cannot read at all is reported, not skipped silently.
WORDS = {spelled(n): n for n in range(100)}
NUMBER_WORD = re.compile(
    r"\bthe (" + "|".join(sorted(WORDS, key=len, reverse=True)) + r")\b"
    r"(?! (?:second|minute|hour|day|week|month|year)s?\b)"
)

prose = 0
for bank in banks:
    for name in ("README.md", "tips.md"):
        path = os.path.join("banks", bank["id"], name)
        if not os.path.exists(path):
            continue
        prose += 1
        text = read(path)

        # Figures written in digits, each anchored to the phrase that makes
        # it a figure rather than any other number on the page.
        for pattern, want, what in (
            (r"(\d+)\s+are drawn", bank["drawn"], "draw size"),
            (r"(\d+)\s+original", bank["pool"], "pool size"),
            (r"(\d+)\s+minutes", bank["duration"], "clock"),
            (r"(\d+)%\s+to pass", bank["passing"], "passing score"),
        ):
            for got in re.findall(pattern, text):
                check(path, str(want), got, what)

        # A count written as a word, used as a bare noun — "how many of the
        # seventeen you reach". Only above ten: "the one people forget" and
        # "the two rules" are English, not figures.
        for word in NUMBER_WORD.findall(text.lower()):
            if WORDS[word] <= 10:
                continue
            compared += 1
            if word not in (spelled(bank["drawn"]), spelled(bank["pool"])):
                fail(f"{path}: writes {word!r} where exam.yaml draws "
                     f"{bank['drawn']} of {bank['pool']}")

        for domain, weight in bank["domains"].items():
            if domain in text:
                compared += 1
                if not re.search(rf"{re.escape(domain)} {weight}%", text):
                    got = re.findall(rf"{re.escape(domain)} (\d+)%", text)
                    fail(f"{path}: weights {domain!r} at {got or ['nothing']}, "
                         f"exam.yaml says {weight}%")

for line in failures:
    print(f"check-figures: {line}", file=sys.stderr)

if failures:
    sys.exit(1)

if not compared:
    print("check-figures: made no comparisons at all — the gate is broken",
          file=sys.stderr)
    sys.exit(1)

print(f"check-figures: {compared} published figures across README.md, "
      f"site/index.html, docs/api.md and {prose} bank prose files agree with "
      f"the {len(banks)} listable exam.yaml that own them.")
PY
