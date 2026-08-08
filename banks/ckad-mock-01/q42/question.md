Namespace `antlia` holds four Deployments. Platform wants a plain-text
inventory of them.

Write a report of every Deployment in `antlia` to `/opt/course/42/report`
with exactly three columns, in this order and under exactly these
headings:

| Heading | Value |
|---|---|
| `NAME` | the Deployment's name |
| `REPLICAS` | its **desired** replica count, not how many are ready |
| `IMAGE` | the image of the first container in its Pod template |

The rows must be sorted by replica count, **smallest first**. The file
must hold the header line and one line per Deployment and nothing else —
no counts, no blank banner, no Namespace column.

`kubectl` can produce this whole file on its own. Build the columns and
the ordering with flags rather than editing the output afterwards.
