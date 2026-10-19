**Yes: enforcement is stateful** is correct: NetworkPolicies operate on connections (conntrack), not packet by packet: allowing the initiating direction is enough. Confusing this with stateless ACLs leads to redundant, misleading "response" policies.

Why the others are wrong:

- **Only for 30 seconds** — there is no time limit on established connections; conntrack keeps them allowed for their lifetime.
- **No, the response must be allowed in egress** — response packets belong to a connection the ingress rule already allowed; an egress rule is only consulted for connections the pod initiates.
- **Only with UDP** — statefulness applies to TCP and, via conntrack, to UDP as well.
