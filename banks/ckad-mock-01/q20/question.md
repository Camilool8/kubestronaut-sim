# Question 20 | Expose a Deployment on a node port

*Solve this question on instance: `ssh instance-2`*

Namespace `aquila` runs Deployment `status-page` with 2 replicas, exposed
inside the cluster by a ClusterIP Service named `status-page` on port
`80`.

It now needs to be reachable from outside the cluster as well.

1. Change the Service `status-page` to type `NodePort`, keeping port
   `80`, and pin the node port to exactly `30081`. Leave the Deployment
   alone.
2. Confirm it answers on that node port and save the response body to
   `/opt/course/20/nodeport-check` on `instance-2`.

To reach a node port from inside the cluster, use a node's internal
address:

```bash
k get nodes -o wide
```

In this simulator the node port is also published on the machine running
Docker, so `curl http://localhost:30081` works there too — the real exam
has no such shortcut, and neither does the grader.
