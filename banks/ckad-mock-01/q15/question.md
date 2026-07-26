# Question 15 | ServiceAccounts and tokens

*Solve this question on instance: `ssh instance-1`*

Everything below happens in Namespace `phoenix`.

1. Create a ServiceAccount named `pipeline-runner`.
2. Create a Deployment named `pipeline` with 1 replica, one container
   named `runner` using image `nginx:1.29-alpine`, that runs **as that
   ServiceAccount**.
3. Create a Pod named `no-token` with one container named `web` using
   image `nginx:1.29-alpine`, which must receive **no ServiceAccount
   token at all** — nothing mounted under
   `/var/run/secrets/kubernetes.io/serviceaccount`.
4. Request a token for `pipeline-runner` valid for at least **one hour**
   and save it to `/opt/course/15/pipeline-token` on `instance-1`. Save
   only the token itself, on one line.

Both workloads must be running.
