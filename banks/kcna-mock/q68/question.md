An Ingress resource is applied:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

No `ingressClassName` is set, and the cluster has two ingress controllers installed, neither marked as the default. What is the most likely outcome?
