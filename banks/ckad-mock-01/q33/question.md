Namespace `lupus` runs Deployment `search-stable` on `nginx:1.27-alpine`
with 5 replicas, behind Service `search` on port `80`.

`nginx:1.29-alpine` is ready to trial. Put it in front of real traffic,
but only **one request in five**, by making the two versions share the
Service and letting their replica counts decide the proportion:

1. Create a Deployment named `search-canary` in `lupus` running
   `nginx:1.29-alpine`, with container port `80`.
2. Its Pods must be picked up by the **existing** Service `search`, and
   must still be distinguishable from the stable Pods by a label of their
   own. Give them `track: canary`; the stable Pods carry `track: stable`.
3. Set the two replica counts so that the canary serves one fifth of the
   requests and the Service is backed by **5 Pods in total**, exactly as
   many as it is backed by now.

Do not edit or replace Service `search`, and do not change what
`search-stable` runs.

When you are done, every Pod behind the Service should be ready:

```bash
k -n lupus get endpointslice -l kubernetes.io/service-name=search
```
