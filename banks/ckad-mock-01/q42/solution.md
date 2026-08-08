# Solution 42

One command writes the file:

```bash
k -n antlia get deploy \
  --sort-by=.spec.replicas \
  -o custom-columns='NAME:.metadata.name,REPLICAS:.spec.replicas,IMAGE:.spec.template.spec.containers[0].image' \
  > /opt/course/42/report

cat /opt/course/42/report
# NAME             REPLICAS   IMAGE
# search-indexer   1          busybox:1.37
# audit-writer     2          busybox:1.37
# image-resizer    3          nginx:1.27-alpine
# billing-api      4          nginx:1.29-alpine
```

Quote the `custom-columns` argument. It contains `[0]`, and an unquoted
bracket is glob syntax the shell will try to expand before `kubectl` ever
sees it.

## custom-columns

The format is a comma-separated list of `HEADING:<path>` pairs, and both
halves matter:

- The heading is printed **verbatim**. `name:` gives you a lowercase
  `name` column, so the capitals in the report are yours to type.
- The path is a JSONPath expression with no braces around it — the
  braces belong to `-o jsonpath`, not here. It is the same walk
  `kubectl explain deployment.spec.replicas` describes.

A path that matches nothing prints `<none>` rather than failing, which
is how a typo shows up: a column of `<none>` down the whole report.

There is a file-backed form of the same thing for a report you run
often, where the columns are whitespace-separated on their own lines:

```bash
k -n antlia get deploy -o custom-columns-file=/opt/course/42/cols.txt
```

## Sorting

`--sort-by` takes one JSONPath expression, also unbraced, and reorders
the list server-side output before printing. It is independent of the
output format, so it works with `custom-columns`, with `wide`, and with
the default columns:

```bash
k -n antlia get deploy --sort-by=.spec.replicas          # ascending
k -n antlia get deploy --sort-by=.metadata.creationTimestamp
```

Two things about it are worth knowing under a clock:

- **It sorts by type.** An integer field sorts numerically, so `10`
  comes after `4` rather than before it as a lexical sort would put it.
- **There is no descending flag.** To reverse it, pipe through `tac`, and
  keep the header where it belongs:

```bash
k -n antlia get deploy --sort-by=.spec.replicas \
  -o custom-columns='NAME:.metadata.name,REPLICAS:.spec.replicas' \
  | (read -r h; echo "$h"; tac)
```

## Why not jsonpath

`-o jsonpath` can produce the same three fields, and it is the wrong tool
for a report:

```bash
k -n antlia get deploy \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\n"}{end}'
```

That gives you no header, no column alignment, and tabs you then have to
think about. `jsonpath` is for extracting **one value** to feed to
something else — an image to record, a nodePort to curl. `custom-columns`
is for output a person reads.

The same split shows up in what each one does with a missing field.
`jsonpath` fails the whole command; `custom-columns` prints `<none>` in
that cell and carries on, which is what you want across a list of
objects that are not all identical.
