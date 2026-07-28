## Hint 1

Two separate faults, and one of them is easy to fix and easy to miss.
Compare the Service side by side with the Deployment it is meant to
select — `kubectl -n serpens get deploy inventory -o yaml` and the
Service's `spec`.

An EndpointSlice with no addresses means the selector is wrong. A
populated one that still does not answer means the port is.

## Hint 2

Check `spec.selector` against the Deployment's Pod labels
(`kubectl -n serpens get pods --show-labels`), and check `targetPort`
against the container's actual port.

`port` is what clients call; `targetPort` is where it lands. Getting the
second wrong gives you endpoints that exist and connections that hang.

Then reach it with a throwaway Pod, e.g.
`kubectl -n serpens run probe --rm -it --restart=Never --image=nginx:alpine -- curl -s http://inventory`.
