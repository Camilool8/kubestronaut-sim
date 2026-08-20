Namespace `gemini` runs Deployment `pollux-web` with 2 replicas. The
container listens on `8080` and the Deployment declares that port without
naming it. Nothing exposes the Pods yet.

1. In Deployment `pollux-web`, give the container's port `8080` the name
   `http-web`. Leave the port number and everything else about the
   Deployment as it is.
2. Create a Service named `pollux-web` in the same namespace, of type
   `NodePort`, publishing port `80` and pinned to node port exactly
   `30081`. Its `targetPort` must reference the container's port **by
   name**, not by number.

The application answers with a single word, `pollux-ok`. A node port is
open on every node, so a request from any Pod in the cluster to a node's
internal address is what proves the Service works:

```bash
k get nodes -o wide
```
