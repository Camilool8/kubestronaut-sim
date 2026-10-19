**Raise the physical MTU to 9000 and set pods to 8950** is correct: The pod limit is always physical MTU − overhead (~50 for VXLAN). With end-to-end jumbo frames, 8950 on the pods multiplies data-workload throughput. The common mistake is raising only one side.

Why the others are wrong:

- **Disable VXLAN** — switching encapsulation is a different design decision with its own routing requirements; jumbo frames improve VXLAN as it is.
- **MTU 65535 on the pods** — the pod MTU must fit inside the physical MTU after encapsulation; 65535 exceeds any Ethernet link and would fragment or drop every large packet.
- **Keeping 1450 — mandatory with any VXLAN** — 1450 is only the right answer for a 1500-byte physical network; the overhead is fixed, the base is not.
