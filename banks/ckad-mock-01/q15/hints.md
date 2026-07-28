## Hint 1

Two of these are one field each on a Pod spec, and they are different
fields — one names the ServiceAccount, the other switches the token off.

Task 4 is a `kubectl` subcommand, not something you extract from a
Secret; ServiceAccount token Secrets have not been auto-created for
several releases now.

## Hint 2

`serviceAccountName: pipeline-runner` on the Deployment's Pod template.

`automountServiceAccountToken: false` on the `no-token` Pod's spec.

`kubectl -n phoenix create token pipeline-runner --duration=2h` prints
the token on stdout — redirect it, and check the file has no trailing
blank line or shell prompt in it.
