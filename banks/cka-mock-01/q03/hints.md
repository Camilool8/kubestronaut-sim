## Hint 1

Two faults, both on the Service, and the endpoint list is where the
symptom is:

```bash
k -n draco get endpointslice -l kubernetes.io/service-name=nova-api
```

Neither the `ENDPOINTS` column nor the `PORTS` column is populated, and
each has its own cause. Read the Service beside the Deployment it is
meant to select — the disagreements are visible without changing
anything.

## Hint 2

One disagreement is on `spec.selector`, against
`k -n draco get pod --show-labels`.

The other is on `targetPort`, and it is not a number — the container's
port is named, and the Service is asking for a name near it rather than
the name itself. Compare the two strings character by character:

```bash
k -n draco get deploy nova-api \
  -o jsonpath='{.spec.template.spec.containers[*].ports[*].name}'
```

Leave `port: 80` as it is, and count the ready endpoints from the
Service's own list once it answers, not from the Deployment's replicas.
