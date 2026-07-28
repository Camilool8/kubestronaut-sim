## Hint 1

Two ConfigMaps, made two different ways — one from literals, one from
a file. `kubectl create configmap --help` shows both flags.

"Without listing them one by one" is a specific env mechanism, not a
list of `env:` entries.

## Hint 2

`--from-literal` twice for the first; `--from-file` for the second.
`--from-file` names the key after the file's basename, which is already
`limits.conf`, so you do not need to override it.

In the Pod, `envFrom` with a `configMapRef` pulls in every key. That is
the one that avoids listing them.

Read the value back with `kubectl -n atlas exec tuned -c web -- printenv
MAX_WORKERS`.
