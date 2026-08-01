You apply the following Service manifest to a cluster:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
```

The `type` field is not set. Which Service type does Kubernetes assign to this Service?
