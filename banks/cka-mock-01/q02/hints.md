## Hint 1

The Pod's status tells you which tool to reach for. A container that is
restarting over and over is one that started and then exited, so it had
time to say something on the way out — that is a logs problem, not a
`describe` one. The run you want to read is the one that already died.

Once you have the message, the variable it names has to be traced back to
where the Pod template says it comes from.

## Hint 2

`kubectl -n lyra logs deploy/payments-api --previous`.

Then compare two things: the `env` entries on the Pod template, and the
`data` keys of the ConfigMap the template names. One variable is wired to
a key that is not there; the other is wired correctly and shows you the
shape.

Two things to know while you work. Key names are case-sensitive, and a
hyphen is not an underscore. And `optional: true` on a key reference is
why this crashes rather than refusing to start — the kubelet leaves the
variable unset instead of holding the container back.

If you fix this from the ConfigMap side rather than the template side,
remember that a container reads its environment once, at start.
