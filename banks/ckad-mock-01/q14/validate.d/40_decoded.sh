#!/usr/bin/env bash
# points: 1
# desc: the decoded ledger-creds password was saved on the instance
set -uo pipefail
got=$(cat /opt/course/14/ledger-password 2>/dev/null | tr -d '[:space:]')
[ "$got" = "Qx7-plasma-42" ] \
  && echo "decoded password recorded" \
  || { echo "/opt/course/14/ledger-password contains '$got' — is it still base64?"; exit 1; }
