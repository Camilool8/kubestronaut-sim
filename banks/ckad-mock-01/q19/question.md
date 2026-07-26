# Question 19 | A Service that reaches nothing

*Solve this question on instance: `ssh instance-1`*

Namespace `serpens` runs Deployment `inventory` with 2 replicas. Its
Service, also named `inventory`, is supposed to expose it on port `80`
but nothing can reach it. The Deployment is correct — the Service is not,
in **two** separate ways.

1. Fix the Service. Do not modify the Deployment.
2. From inside the cluster, request the Service on port `80` and save the
   response body to `/opt/course/19/service-check` on `instance-1`.

The application answers with a single word, so you will know when you
have reached it.

A Service with no ready endpoints is the symptom worth learning to read:

```bash
k -n serpens get endpointslice -l kubernetes.io/service-name=inventory
```
