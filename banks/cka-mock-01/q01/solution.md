# Solution 1

```bash
k -n cka-rbac create sa deploy-bot
k -n cka-rbac create role deployment-manager \
  --verb=get,list,watch,create,update,patch \
  --resource=deployments.apps
k -n cka-rbac create rolebinding deploy-bot-binding \
  --role=deployment-manager \
  --serviceaccount=cka-rbac:deploy-bot
k auth can-i update deployments -n cka-rbac \
  --as=system:serviceaccount:cka-rbac:deploy-bot > /opt/course/1/can-update
```

Verify: `cat /opt/course/1/can-update` → `yes`.
