# Question 6 | ConfigMaps, as env and as a volume

*Solve this question on instance: `ssh instance-2`*

Team Atlas needs its configuration split between environment variables
and a mounted file, in Namespace `atlas`.

1. Create a ConfigMap named `app-tuning` with two entries:
   `LOG_LEVEL=debug` and `MAX_WORKERS=8`.
2. A configuration file already exists at `/opt/course/6/limits.conf` on
   `instance-2`. Create a ConfigMap named `app-limits` from that file.
   The key inside the ConfigMap must be `limits.conf`, and the value must
   be the file's contents unchanged.
3. Create a Pod named `tuned` running image `nginx:1.29-alpine`, with one
   container named `web`, that consumes both:
   - **every** entry of `app-tuning` as environment variables, without
     listing them one by one
   - `app-limits` mounted **read-only** as a volume named `limits` at
     `/etc/app`
4. Once the Pod is running, save the value the container actually sees
   for `MAX_WORKERS` to `/opt/course/6/max-workers` on `instance-2` —
   digits only.
