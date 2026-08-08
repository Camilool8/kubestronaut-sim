## Hint 1

A Job that has finished — either way — records that as a condition on its
status, and the condition carries a machine-readable reason as well as a
sentence. `kubectl describe` prints it; `-o jsonpath` gets you the one
word on its own.

The Pods it left behind are still there, in a terminal phase rather than
deleted. That is where the container's output is, and a label selector
reaches all of them at once without you naming any.

## Hint 2

Almost nothing in a Job's spec can be edited after it exists — the
completion count and the whole Pod template are rejected — so step 3
means deleting and creating, not patching.

Four fields carry the requirements: two of them are siblings of each
other under `spec` and describe how much work there is and how much runs
concurrently; the third caps failures; the fourth is a wall clock over
the entire Job and lives beside them rather than inside the template.

The last requirement is about the Pod, not the Job: `restartPolicy` on
`spec.template.spec`, and the value that keeps the same Pod and restarts
its container.

`kubectl explain job.spec` lists all of them with their defaults.
