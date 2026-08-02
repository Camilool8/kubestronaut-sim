Team Aurora owns every Namespace labeled `team=aurora`.

1. Create a new Namespace `aurora-staging` labeled `team=aurora`.
2. In it, create a ResourceQuota named `staging-quota` that limits the
   Namespace to at most **5 Pods** and **1 CPU** of total requests.
3. Save an alphabetically sorted list of the **names only** (no header, one
   per line) of all Namespaces labeled `team=aurora` — including the one you
   just created — to `/opt/course/1/aurora-namespaces` on `instance-1`.
