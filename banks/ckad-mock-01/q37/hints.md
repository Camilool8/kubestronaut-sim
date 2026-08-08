## Hint 1

Three objects in order, and each one needs the previous: a key pair on
disk, a Secret built from it, an Ingress that names the Secret.

`openssl req` writes a certificate and a key in one invocation when you
ask it for a self-signed one and tell it not to encrypt the key. It will
prompt for a subject unless you pass one on the command line.

`kubectl create secret` has a subcommand per Secret type, and one of them
is for exactly this pair of files — it sets the type and the two data
keys for you, and both are fixed names you do not get to choose.

## Hint 2

The routing and the certificate are separate blocks of the same Ingress.
`spec.rules` decides where a request goes; `spec.tls` decides which
Secret ends the encryption, and it lists the host names it covers. A
host that appears in `rules` but not in `tls` is served over plain HTTP
only.

If the controller answers but the certificate says it belongs to
`Kubernetes Ingress Controller Fake Certificate`, the Ingress was
admitted and your Secret was not found — check the Secret's Namespace,
its name in `spec.tls`, and that the host in `spec.tls` matches the host
in `spec.rules` exactly.
