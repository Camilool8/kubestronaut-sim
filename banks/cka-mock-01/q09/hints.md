## Hint 1

Two of the three steps are ordinary release lifecycle; the third never talks
to the cluster at all. There is a Helm subcommand that renders a chart and
prints the YAML instead of installing it — redirect that into the file.

Before writing any override, ask the chart what it is willing to be told.
`helm show values` prints the defaults, and one of the two keys you need is
nested inside another.

And be careful across step 2: an upgrade re-renders the chart from the values
it is given *on that command line*, not from the ones the previous revision
held.

## Hint 2

`helm search repo sim/sim-web --versions` lists what the repo publishes; pin
the install and the upgrade with `--version`.

The nested value is `service.port`, which on a `--set` is one dotted path.

For the upgrade, either repeat both overrides or ask Helm to carry the old
ones forward with `--reuse-values` — with neither, the release silently goes
back to the chart's own defaults. `helm get values` and `helm history` show
what actually stuck.

The render takes the release name as an argument, not a flag, and the chart
names every object after it.
