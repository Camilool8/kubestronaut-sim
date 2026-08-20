Namespace `hydra` runs a three-tier application: Deployments `frontend`
(`tier=frontend`), `api` (`tier=api`) and `db` (`tier=db`). `api` serves the
application on TCP **8080** and an admin endpoint on TCP **9090** from the
same Pod; `db` serves on TCP **5432**. Nothing restricts traffic in the
Namespace today: every Pod reaches every other one, on every port. The
cluster runs Calico, so a NetworkPolicy here is enforced the moment it exists.

Shut the Namespace, then open exactly one path through it.

1. Create a NetworkPolicy named `default-deny` in `hydra` that selects
   **every** Pod in the Namespace and denies **both** directions. On its own
   it must allow nothing.
2. Create `allow-api-ingress`: the `tier=api` Pods accept connections from the
   `tier=frontend` Pods on TCP `8080` — from no other source, and on no other
   port.
3. Create `allow-frontend-egress`: the `tier=frontend` Pods may open
   connections to the `tier=api` Pods on TCP `8080`, and to the cluster's DNS
   Pods in Namespace `kube-system` on TCP and UDP `53`. Nothing else.
4. Keep every rule least-privilege. Each peer you write must select Pods by
   label and each rule must name its ports: a rule with no peer, one with no
   ports, or one opening a whole Namespace or every address is not an answer
   here.

Finish with the application still working and nothing else reachable. From a
`frontend` Pod, `api` must still answer on `8080` and cluster DNS names must
still resolve; `db` must not reach `api`, `frontend` must not reach `db`, and
`9090` must not be reachable at all.

A denied packet is dropped rather than refused, so a client waits for a
handshake that never comes instead of failing. Give every probe a timeout:

```bash
api=$(k -n hydra get pod -l tier=api -o jsonpath='{.items[0].status.podIP}')

k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:8080/"
k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:9090/"
k -n hydra exec deploy/db       -- wget -q -T 3 -O- "http://${api}:8080/"
k -n hydra exec deploy/frontend -- nslookup api.hydra.svc.cluster.local
```
