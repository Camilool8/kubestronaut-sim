Job `ledger-reconcile` in Namespace `eridanus` has stopped trying. It
never produced a single successful Pod, and it is not going to start
again on its own.

1. Ask the Job why it gave up and write the **reason** it reports —
   that one word, nothing else — to `/opt/course/44/reason`.
2. Save the output the container itself printed before it died to
   `/opt/course/44/failure.log`. The message explaining the failure must
   be in that file.
3. Then replace the Job with one that works. Keep the name
   `ledger-reconcile`, the Namespace, the container name `reconcile` and
   the image `busybox:1.37`, and give the container the command
   `sh -c "echo reconciled"`. The new Job must:

   - run **4 completions**, at most **2 at a time**
   - allow up to **4** failed Pods before giving up
   - abandon the whole run after **120 seconds**, however many attempts
     are left
   - restart a failed container in place rather than replacing its Pod

Wait for it to finish. When you are done the Job must report **4**
successful Pods.

Steps 1 and 2 have to come first: removing the Job removes its Pods, and
their output with them.
