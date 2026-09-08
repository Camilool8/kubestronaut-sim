## Question

El comando `dig app.default.svc.cluster.local` funciona dentro del pod, pero `dig app` falla. ¿Qué debemos comprobar primero?

## Options

- La versión del kernel del nodo
- Las entradas search y ndots en /etc/resolv.conf del pod
- Si el pod tiene hostNetwork habilitado en su spec
- Si kube-proxy está en modo IPVS o iptables

## Solution

**Las entradas search y ndots en /etc/resolv.conf del pod** es la respuesta correcta: Los nombres cortos dependen de los dominios `search` (por ejemplo, `default.svc.cluster.local svc.cluster.local`) y de `ndots:5`. Si se modificaron dnsPolicy/dnsConfig, o si el pod está en otro namespace, el nombre corto no se expande al FQDN correcto.
