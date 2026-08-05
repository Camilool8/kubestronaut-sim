Namespace `volans` runs Deployment `edge-cache`. Its Pod has two
containers, `cache` and `refresher`, and both images are already present
on every node.

These nodes are treated as air-gapped. Change the Deployment so that:

1. Neither container can make the kubelet contact a registry. Each must
   use only the image already on the node, and fail to start rather than
   fetch one.
2. The Pod is given `45` seconds to shut down cleanly instead of the
   default.

The rollout must complete, and both containers must be `Ready`.
