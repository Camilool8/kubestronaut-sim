Deployment `payments-api` in Namespace `draco` currently runs
`nginx:1.27-alpine`.

1. Before changing anything, save the Deployment's **current revision
   number** to `/opt/course/12/revision-before` on `instance-2` — digits
   only.
2. Update the image to `nginx:1.29-alpine` and record the reason for the
   change so it shows up in the rollout history as
   `upgrade to nginx 1.29`. Wait until the rollout finishes.
3. Scale the Deployment to **4** replicas.
4. The upgrade is then rejected by the change board. Roll the Deployment
   **back to the image it was running before**, using the rollout
   history rather than editing the image by hand.
5. Save the full rollout history to `/opt/course/12/history` on
   `instance-2`.

At the end, `payments-api` must be running `nginx:1.27-alpine` with 4
ready replicas.
