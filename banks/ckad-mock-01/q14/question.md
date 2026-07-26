# Question 14 | Secrets, and a Deployment that cannot read one

*Solve this question on instance: `ssh instance-2`*

Namespace `tucana` holds a Secret `ledger-creds` and a Deployment
`ledger-api` that is failing to start.

1. Create a Secret named `api-keys` in `tucana` with two entries:
   `apikey=vega-7731` and `apisecret=RvT2-88x`.
2. `ledger-api` never starts because it asks `ledger-creds` for a key
   that does not exist. Fix the **Deployment** so its Pods run. Do not
   change `ledger-creds` — the key it already holds is the correct one.
3. Also give `ledger-api` the new Secret as a file: mount `api-keys` as a
   read-only volume named `api-keys` at `/etc/api`, with the projected
   files created in mode `0400`.
4. Save the **decoded** value of the `password` entry in `ledger-creds`
   to `/opt/course/14/ledger-password` on `instance-2`.

`ledger-api` must end up with 1 ready replica.
