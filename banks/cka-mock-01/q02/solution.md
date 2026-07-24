# Solution 2

    k label node sim-worker disk=ssd
    k -n cka-sched run fast-store --image=nginx:1.29-alpine \
      --overrides='{"spec":{"nodeSelector":{"disk":"ssd"}}}'
    k -n cka-sched wait --for=condition=Ready pod/fast-store --timeout=60s
    k -n cka-sched get pod fast-store -o jsonpath='{.spec.nodeName}' > /opt/course/2/node

Verify: `cat /opt/course/2/node` → `sim-worker`.
