## Hint 1

A container that restarts on a schedule, with nothing wrong in its log,
is almost always being killed from outside rather than exiting on its
own. Whatever kills it says so in the Pod's events, naming the check that
failed and the address it tried.

Read the events before you change anything: repairing the Deployment
rolls out fresh Pods and takes their event history with them.

## Hint 2

Compare the address in the event against the port the container is
declared to serve on. They are not the same number, and only one of them
has anything listening on it.

The probe lives on the Pod template, so the fix is an edit to the
Deployment rather than to a Pod — `spec.template.spec.containers[]`, the
`httpGet` block. Watch the rollout finish before you judge whether it
worked:

```bash
k -n horologium rollout status deploy/session-store
```
