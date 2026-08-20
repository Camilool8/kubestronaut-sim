Namespace `sagitta` runs the payments API as the Deployment
`payments-api`: three replicas of a single container named `api`. Traffic
is about to turn seasonal and the team wants the replica count decided by
an autoscaler instead of by hand.

1. Give the `api` container a CPU **request** of `100m`. Leave its memory
   request and limit as they are. An autoscaler that targets average CPU
   *utilization* targets a percentage **of the request**, so a container
   that requests no CPU gives it nothing to take a percentage of.

2. Create a HorizontalPodAutoscaler named `payments-api` in `sagitta`
   that scales the Deployment `payments-api` to:

   | Setting | Value |
   |---|---|
   | Minimum replicas | 2 |
   | Maximum replicas | 6 |
   | Metric | average CPU utilization, target 50 % |
   | Scale-down stabilization window | 60 seconds |

   Write it as `autoscaling/v2`: `autoscaling/v1` has no field for the
   stabilization window at all, and no `kubectl autoscale` flag writes
   one in either version.

The Deployment's own `spec.replicas` is not part of this task — from here
on, sizing is the autoscaler's job.

One thing to expect rather than debug: this cluster runs no
metrics-server, so `kubectl get hpa` will report the target as
`<unknown>/50%` and the autoscaler will not move the replica count. That
is the environment, not a fault in your answer. What is graded is the
configuration you leave behind.
