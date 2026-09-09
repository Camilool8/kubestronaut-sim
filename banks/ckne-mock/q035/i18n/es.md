## Question

Respecto al comportamiento de NetworkPolicy, ¿qué afirmación es correcta?

## Options

- Las policies requieren un orden de prioridad numérico
- La última policy aplicada sobrescribe las anteriores
- Las policies son aditivas (allow-list)
- Las policies funcionan incluso sin soporte del CNI

## Solution

**Las policies son aditivas (allow-list)** es la respuesta correcta: Las NetworkPolicies nativas solo permiten tráfico: seleccionar un pod lo aísla y lo permitido es la unión de todas las policies. No existe deny explícito ni precedencia, y la aplicación depende del CNI (Flannel sin extensiones ignora las policies). Los CRD de Cilium/Calico añaden deny y prioridad.
