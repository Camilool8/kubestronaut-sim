# Solution 2

    mkdir -p /opt/course/2
    k -n nova get deploy nova-api -o jsonpath='{.spec.template.spec.containers[0].image}' > /opt/course/2/old-image
    k -n nova edit deploy nova-api

In the editor: set image `nginx:1.29-alpine`, `replicas: 3`, add under the
container:

    readinessProbe:
      httpGet: {path: /, port: 80}
      initialDelaySeconds: 5
      periodSeconds: 10

and under `spec.strategy`:

    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}

Then `k -n nova rollout status deploy nova-api`.
