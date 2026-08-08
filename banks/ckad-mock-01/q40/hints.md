## Hint 1

Replicas of a Deployment all reference the same claim, which is exactly
what this question forbids. The workload you want takes a *template* for
storage rather than a claim, and its controller stamps one claim out of
that template per replica.

It also insists on knowing which Service stands in front of it, and that
Service has to be one with no address of its own.

## Hint 2

`spec.volumeClaimTemplates` is a sibling of `spec.template`, not
something inside it, and each entry looks like the `spec` of a
PersistentVolumeClaim. Mount it in the container under the template's
`metadata.name`.

`spec.serviceName` takes the name of the Service. A Service is headless
when `clusterIP` is `None`.

`kubectl -n cepheus get pvc` prints the claim names the controller
generated; the pattern is `<template>-<workload>-<ordinal>`.
