## Hint 1

Find out what the chart is willing to be told before writing anything
down. `helm show values` prints the defaults, and the shape of that
output is the shape your file has to be in — one of the two keys is
nested inside another.

The flag that reads a values file is the same short flag `kubectl` uses
for a manifest.

## Hint 2

```bash
helm show values sim/sim-cache
```

Override the tag only, not the repository or the pull policy: Helm merges
your file into the chart's defaults key by key, so anything you leave out
keeps coming from the chart.

Install with `helm -n caelum install <release> <chart> -f <file>`, then
read back what the release believes it was given with
`helm -n caelum get values object-cache`.
