#!/usr/bin/env python3
"""Work out the next release from the commits since the last one.

    git log --format=%B%x00 "$last..HEAD" | next-version.py v0.1.5

Reads NUL-separated commit messages on stdin and prints the next version on
stdout. Exits 3 with nothing on stdout when there is nothing to release, which
is how the workflow decides to stop.

Conventional Commits decides the size of the bump:

    feat!: / BREAKING CHANGE: in the body   major
    feat:                                   minor
    anything else                           patch

"Anything else" is doing real work in this repo. The history mixes proper types
with subject prefixes that only look like them — grade:, site:, session:, copy:
— and an unrecognised prefix has to mean patch rather than nothing, or a release
would silently skip the commits that make up most of the log.

While the major version is 0 a breaking change bumps the MINOR instead, so
v1.0.0 stays a deliberate manual tag rather than something one stray `feat!:`
can declare on the project's behalf.
"""

import re
import sys

PATCH, MINOR, MAJOR = 0, 1, 2

# type(optional scope)(optional !): subject
SUBJECT = re.compile(r"^(?P<type>[A-Za-z]+)(?:\((?P<scope>[^()]*)\))?(?P<breaking>!)?:\s")

# A footer, so it has to start its own line. "this is not a BREAKING CHANGE: ..."
# buried in a paragraph is prose, not a declaration.
BREAKING_FOOTER = re.compile(r"^BREAKING[ -]CHANGE:", re.MULTILINE)


def classify(message):
    """The bump one commit asks for."""
    subject = message.strip().split("\n", 1)[0]
    match = SUBJECT.match(subject)

    if BREAKING_FOOTER.search(message):
        return MAJOR
    if match and match.group("breaking"):
        return MAJOR
    if match and match.group("type").lower() == "feat":
        return MINOR
    return PATCH


def bump_for(messages):
    """The largest bump any of them asks for, or None if there is nothing."""
    bumps = [classify(m) for m in messages if m.strip()]
    return max(bumps) if bumps else None


def parse_version(text):
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", text.strip())
    if not match:
        raise ValueError(f"cannot read a version out of {text.strip()!r}")
    return tuple(int(g) for g in match.groups())


def next_version(current, bump):
    major, minor, patch = current

    # Pre-1.0 the API is not promised, so a breaking change is a minor bump.
    if bump == MAJOR and major == 0:
        bump = MINOR

    if bump == MAJOR:
        return major + 1, 0, 0
    if bump == MINOR:
        return major, minor + 1, 0
    return major, minor, patch + 1


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip().split("\n\n")[1], file=sys.stderr)
        return 2

    current = parse_version(argv[1])
    messages = sys.stdin.read().split("\0")
    bump = bump_for(messages)

    if bump is None:
        print("nothing to release: no commits since the last tag", file=sys.stderr)
        return 3

    major, minor, patch = next_version(current, bump)
    print(f"v{major}.{minor}.{patch}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
