**Driver checksum offload miscomputed with VXLAN** is correct: A production classic: checksum offload on the VXLAN interface produces invalid checksums on certain kernel/driver combos. Disabling offload on the vtep fixes it — and explains "ping passes, the application hangs".

Why the others are wrong:

- **The kernel doesn't support TCP over VXLAN** — TCP over VXLAN is the normal case for every overlay-based cluster; the kernel has supported it for years.
- **Out of memory** — memory exhaustion produces OOM kills and evictions, not silently corrupted TCP streams that a NIC offload toggle repairs.
- **MTU set too high on every physical interface** — an MTU problem drops large packets outright and is fixed by lowering the MTU, not by changing checksum computation; the symptom here is bad checksums, not size.
