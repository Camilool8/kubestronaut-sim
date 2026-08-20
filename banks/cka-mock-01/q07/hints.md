## Hint 1

Nothing you can type at the API fixes this. The Ready condition is written by
the node's own kubelet, and `Unknown` means the control plane has stopped
hearing from it — not that the control plane decided anything is wrong. So the
next command is `ssh cka-worker3`, and the first question on the machine is
whether the service that reports that condition is running at all:

```bash
systemctl status kubelet
journalctl -u kubelet --no-pager | tail -30
```

Read the whole first block of `status`, not just the green or red word. Two
separate facts live there, on two different lines.

## Hint 2

`systemctl status kubelet` prints something like:

```text
Loaded: loaded (/etc/systemd/system/kubelet.service; disabled; preset: enabled)
Active: inactive (dead)
```

`Active:` is the state right now. `Loaded:` carries the other half — `disabled`
means the unit is not linked into any boot target, so nothing will start it the
next time this machine boots.

Fixing only the first of those gets the node Ready and leaves the second one
broken, and the question grades them separately. One command covers both:

```bash
systemctl enable --now kubelet
```

`enable` writes the boot-time symlink, `--now` starts it immediately. Confirm
both halves before you leave the node — `systemctl is-enabled kubelet` and
`systemctl is-active kubelet` — then watch `k get nodes` from your terminal;
Ready comes back within a few seconds, and the `node-probe` Pod starts on its
own once it does.
