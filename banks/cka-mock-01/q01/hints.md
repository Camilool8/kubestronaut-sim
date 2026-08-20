## Hint 1

Read the Pods before you read the manifest. A Pod that never pulled its
image and a Pod that runs but never reports itself ready say so very
differently in the STATUS and READY columns, and this Deployment shows you
only the first of the two until you have dealt with it.

Only one of the two faults can be seen from the Pod list. The other is a
field you have to compare against something else in the same Pod template.

## Hint 2

Fault one is the tag on `spec.template.spec.containers` — the question
tells you what it should be.

For fault two, put two fields side by side: the container's
`ports.containerPort` and the port under the probe's `httpGet`. A probe
sent to a port nothing is listening on never succeeds, so the Pod stays
Running and never joins the ready count — no restarts, no crash, no log
line to find.

`kubectl explain deploy.spec.template.spec.containers.readinessProbe`
names every field if you would rather not guess.
