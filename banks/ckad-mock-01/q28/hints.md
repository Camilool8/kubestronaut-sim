## Hint 1

`kubectl create secret -h` lists three subcommands, and only one of them
produces the `type` this question names. Building the JSON by hand and
loading it as a generic Secret leaves the type `Opaque`, which the
kubelet never looks at for credentials.

Task 2 is a single list on the Pod spec. It sits beside `containers`,
not inside one — the credential is used before any container exists.

## Hint 2

The subcommand is `docker-registry`, and its three flags are
`--docker-server`, `--docker-username` and `--docker-password`.

The Pod field is `spec.imagePullSecrets`: a list whose entries carry one
key, `name`. `kubectl explain pod.spec.imagePullSecrets` has the shape.

To see what was stored, decode `.data` — the single entry is keyed
`.dockerconfigjson`, leading dot included.
