Namespace `equuleus` will run workloads published to the in-cluster
registry at `registry:5000`, and that registry expects credentials.

1. Create a Secret named `registry-cred` in Namespace `equuleus`, of
   type `kubernetes.io/dockerconfigjson`, holding the credentials for
   server `registry:5000` — username `pipeline`, password `s3cr3t-pull`.
2. Create a Pod named `puller` in `equuleus` with a single container
   named `web`, image `nginx:1.29-alpine`, which presents `registry-cred`
   to the kubelet when it pulls images.

The Pod must reach `Running`. Its image is one every node already holds,
so nothing is actually fetched — what is graded is the Secret's type and
contents and the Pod's reference to it.
