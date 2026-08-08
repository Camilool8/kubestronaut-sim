Namespace `mensa` runs Deployment `catalog`, already exposed inside the
cluster by a ClusterIP Service named `catalog` on port `80`.

Namespace `octans` runs Deployment `shopfront`. It has to read that
catalog, and it only ever asks for the name `catalog` — it knows nothing
about the Namespace the catalog lives in.

1. Create a Service named `catalog` in Namespace `octans` of type
   `ExternalName`, aimed at the fully-qualified name of the Service in
   `mensa`: `catalog.mensa.svc.cluster.local`.
2. From a Pod in `octans`, request `http://catalog/` and save the
   response body to `/opt/course/36/catalog-check` on `instance-2`.

The catalog answers with a single word naming itself, so you will know
when you have crossed the Namespace boundary:

```bash
k -n octans exec deploy/shopfront -- curl -s http://catalog/
```
