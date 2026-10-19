During a rollout, new pods enter the EndpointSlice as ready and IMMEDIATELY receive traffic, but return 502 for ~3s. The readinessProbe is passing. Where is the trap?
