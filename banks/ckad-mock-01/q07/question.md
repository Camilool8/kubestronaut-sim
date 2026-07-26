# Question 7 | Lock down a Pod

*Solve this question on instance: `ssh instance-1`*

Namespace `cygnus` needs a hardened workload.

Create a Pod named `vault-agent` in Namespace `cygnus` with a single
container named `agent`, image `busybox:1.37`, command
`sh -c "sleep 3600"`, satisfying **all** of the following:

1. It runs as user ID `10001` and group ID `20001`, and the kubelet must
   refuse to start it if the image would run as root.
2. It cannot gain more privileges than it starts with.
3. Its root filesystem is read-only.
4. It drops **all** Linux capabilities.
5. It requests `100m` CPU and `64Mi` memory, and is limited to `500m` CPU
   and `128Mi` memory.

The Pod must reach `Running`.
