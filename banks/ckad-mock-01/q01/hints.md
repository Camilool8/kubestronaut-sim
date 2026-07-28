## Hint 1

`kubectl create` can make both objects, but only one of them takes the
limits you need as flags. For the file, remember that `-o name` prints
`kind/name` — the question asks for names only.

## Hint 2

`kubectl create quota` takes `--hard`. The two keys you want are `pods`
and `requests.cpu`.

Watch the label: creating the Namespace and labelling it are two steps
unless you use `--dry-run=client -o yaml` and edit, and the file must
list *all* matching Namespaces including the new one — so build it after
the Namespace exists, and strip the `namespace/` prefix.
