Namespace `draco` runs Deployment `nova-api` with 2 replicas. Its
Service, also named `nova-api`, is meant to expose the Pods inside the
cluster on port `80`, but it has no endpoints and nothing can reach it.
The Deployment is correct — the Service disagrees with it in **two**
separate places.

1. Fix the Service. Do not modify the Deployment, and keep `targetPort`
   referencing the container's port **by name**, not by number.
2. Once the Service answers, write the number of **ready** endpoints it
   has to `/opt/course/3/endpoints` on `instance-1` — the number alone,
   nothing else.

The application replies with a single word, so a request from any Pod in
the namespace tells you when it is fixed.
