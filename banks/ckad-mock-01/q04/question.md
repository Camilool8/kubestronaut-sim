Team Vega runs its housekeeping in Namespace `vega`.

1. Create a CronJob named `log-rotate` that runs **every 5 minutes**. Its
   Pod runs one container named `rotate`, image `busybox:1.37`, command
   `sh -c "date; echo rotated"`, with `restartPolicy: OnFailure`.
2. The same run must never overlap with a previous one that is still
   going, and only the last **2** successful and **1** failed Jobs may be
   kept in history.
3. Create a **one-off** Job named `backfill` in the same Namespace. One
   container named `worker`, image `busybox:1.37`, command
   `sh -c "sleep 2; echo backfilled"`. It must run **3 completions**, at
   most **2 at a time**, and give up after **2** retries.
4. Wait until `backfill` has completed, then save its number of
   successful Pods to `/opt/course/4/backfill-succeeded` on
   `instance-2` — digits only, nothing else.
