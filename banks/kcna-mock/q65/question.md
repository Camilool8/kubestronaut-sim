A Pod is defined with this security context:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hardened-app
spec:
  securityContext:
    runAsNonRoot: true
  containers:
    - name: app
      image: legacy-app:3.2
```

The `legacy-app:3.2` image's Dockerfile has no `USER` instruction, so its containers run as root (UID 0) by default. What happens when this Pod is applied?
