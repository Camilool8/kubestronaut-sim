**Runs the plugin binary with CNI_COMMAND=ADD, config via stdin** is correct: CNI is a binary-execution contract: the runtime runs the plugin with env vars like `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME`, and the JSON config via stdin. The plugin returns JSON with IPs/routes. DEL is called on removal.

Why the others are wrong:

- **Sends a NetworkRequest CRD to the apiserver** — there is no such CRD; the CNI contract is between the runtime and a local binary, and the API server is not involved in wiring a pod.
- **Writes directly into the pod netns routing tables** — the runtime creates the netns and delegates all configuration — interface, IP, routes — to the plugin; writing routes itself would defeat the plugin model.
- **Calls the CNI plugin's REST API over HTTPS** — CNI plugins are executables invoked with environment variables and stdin, not network services; some CNIs run a daemon, but the runtime still calls a binary.
