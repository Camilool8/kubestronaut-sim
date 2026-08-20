The logistics team has extended this cluster's API with its own resources.
Namespace `pyxis` is where its consignments are tracked.

1. Write the name of every CustomResourceDefinition in the API group
   `logistics.sim.dev` to `/opt/course/11/crds` on `instance-1` — one name
   per line, the name alone. No CRD from any other group belongs in that
   file.

2. Write the output of `kubectl explain shipment.spec` to
   `/opt/course/11/shipment-spec` on `instance-1`, as the command prints it.

3. Create a single `Shipment` named `atlas-7` in Namespace `pyxis` for the
   consignment below:

   | | |
   |---|---|
   | destination | `rotterdam-north` |
   | gross weight | 1200 kilograms |
   | service level | express |
   | carrier | `blue-line` |
   | contract | `LOG-2291` |

The question deliberately does not tell you what the fields are called or
how they nest. That is what step 2 is for.
