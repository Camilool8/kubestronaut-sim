**Build a new container image containing the patch and roll out replacement Pods** is correct: with immutable infrastructure, running instances are never modified after deployment. Changes are made by building a new versioned artifact — here a container image — and replacing the old instances with new ones, typically through a rolling update. This keeps every running instance reproducible from its image and makes rollback as simple as redeploying the previous version.

Why the others are wrong:

- **SSH into each running container and apply the patch in place** — modifying running instances is the definition of mutable infrastructure. The change is not captured in the image, so restarts or new replicas silently lose the patch and instances drift apart.
- **Use kubectl exec to update packages inside the Pods and keep them running** — this is in-place mutation with a Kubernetes tool instead of SSH. The container's writable layer is discarded when the Pod is recreated, so the fix is temporary and unrecorded.
- **Pause the Deployment and hot-patch the shared libraries on each node directly** — patching nodes underneath running containers mutates infrastructure in place and does not update the vulnerable library baked into the container image itself.
