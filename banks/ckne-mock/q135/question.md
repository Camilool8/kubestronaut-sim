kubectl exec into the pod shows eth0 UP with the right IP, but NOTHING goes in or out. On the node, `ip link` shows the veth peer in LOWERLAYERDOWN state. What does that indicate?
