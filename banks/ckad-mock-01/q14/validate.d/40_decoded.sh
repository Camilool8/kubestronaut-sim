#!/usr/bin/env bash
# points: 1
# desc: the decoded ledger-creds password was saved on the instance
set -uo pipefail
. /banks/_lib/checks.sh
got=$(cat /opt/course/14/ledger-password 2>/dev/null | tr -d '[:space:]')
[ "$got" = "Qx7-plasma-42" ] && echo "decoded password recorded" || {
  echo "/opt/course/14/ledger-password contains '$got' — is it still base64?"
  show_actual text "$(cat /opt/course/14/ledger-password 2>/dev/null)"
  show_why "base64 is encoding, not encryption — it hides nothing from anyone who can read the Secret, and the API always hands back the encoded form. The decode therefore has to happen on the way to the file; copying the value straight out of the object writes the encoded string, which is what a file full of trailing equals signs is."
  exit 1
}
