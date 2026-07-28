## Hint 1

Both objects are `kubectl create` one-liners with `--dry-run=client
-o yaml` to get a starting manifest. Everything the question asks for
beyond that is a named field you add.

"Never overlap" is a CronJob field, not something you arrange yourself.

## Hint 2

CronJob: `concurrencyPolicy: Forbid`,
`successfulJobsHistoryLimit: 2`, `failedJobsHistoryLimit: 1`.

Job: `completions: 3`, `parallelism: 2`, `backoffLimit: 2`.

For the count, `kubectl -n vega get job backfill -o jsonpath` on
`.status.succeeded` gives you digits with nothing around them.
