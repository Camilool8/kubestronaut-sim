A new image tag was rolled out to a Deployment, and checking the rollout shows it is stuck because the new Pods are crash-looping:

```bash
kubectl rollout status deployment/web
```

The team wants to return the Deployment to the previous working version. Which command is designed for exactly this?
