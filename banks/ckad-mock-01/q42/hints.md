## Hint 1

Two flags do the whole job. One replaces the default column set with
columns you name yourself; the other reorders the rows before anything is
printed. Neither of them needs a pipe into `awk`.

`kubectl get --help` lists both, and the first of the two is one of the
output formats rather than a flag of its own.

## Hint 2

The column format is a comma-separated list of `HEADING:<field path>`
pairs, and the heading is printed exactly as you type it. The field
paths are the same ones `kubectl explain` walks — the desired count lives
on the spec, and the container list is under the Pod template.

The ordering flag takes a single field path with a leading dot and no
braces around it. It sorts a numeric field numerically, so no padding is
needed.

Redirect the command's output straight into the file; every column and
the order are already the command's job.
