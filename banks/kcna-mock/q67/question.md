A Service is defined as:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
    tier: frontend
  ports:
    - port: 80
      targetPort: 8080
```

The running Pods are labeled only `app: web` — none carry `tier: frontend`. Requests to the `web` Service time out. What does `kubectl get endpoints web` show, and why?
