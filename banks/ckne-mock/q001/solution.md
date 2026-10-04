**/etc/cni/net.d/** is correct: Configuration files (*.conf / *.conflist) live in `/etc/cni/net.d/`. The plugin binaries live in `/opt/cni/bin/`. If the config directory is empty, nodes stay NotReady with the error "cni plugin not initialized".

Why the others are wrong:

- **/etc/kubernetes/cni/** — no such directory in the kubelet's defaults — `/etc/kubernetes` holds static-pod manifests and kubeconfigs, not CNI configuration.
- **/opt/cni/bin/** — that is where the plugin *binaries* live (`--cni-bin-dir`); the kubelet reads configuration from `--cni-conf-dir`, never from the binary directory.
- **/var/lib/cni/conf/** — `/var/lib/cni` is where some IPAM plugins keep runtime state such as host-local leases, not where configuration is discovered.
