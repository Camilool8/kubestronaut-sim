Namespace `lyra` runs the Deployment `payments-api`. It has never come up:
the container starts, exits straight away, and is started again.

1. Work out why the container is exiting. The container says so itself
   before it dies.
2. Repair the Deployment so the container gets the value it is missing.
   The value must still come from the ConfigMap `payments-config`, which
   is already in the Namespace and already holds it — do not hardcode it
   into the Pod template and do not change the value itself.
3. When you are done, `payments-api` must be Available with its replica
   ready and staying up.

The Deployment must still be named `payments-api`. Deleting it and
creating a replacement under a different name scores nothing.
