## Hint 1

Task 2 is a debugging task wearing a configuration task's clothes.
`kubectl -n tucana describe pod` on the failing Pod names the key it
cannot find, and `kubectl -n tucana get secret ledger-creds -o yaml`
shows you the key that actually exists.

`0400` is octal, and the field wants a number.

## Hint 2

The Deployment references a wrong key under
`env[].valueFrom.secretKeyRef.key`. Change the reference, not the Secret.

The volume needs `secret.secretName: api-keys` and
`secret.defaultMode: 0400`, plus a `volumeMounts` entry with
`readOnly: true` at `/etc/api`.

Decode with `kubectl -n tucana get secret ledger-creds -o jsonpath='{.data.password}' | base64 -d`.
