## Question

En un mesh multi-cluster de Istio (multi-primary), los workloads del cluster A no confían en los certificados del cluster B y aparecen errores TLS. ¿Qué requisito de identidad se olvidó?

## Options

- Compartir la misma root CA / trust domain
- Utilizar el mismo namespace en ambos
- Desactivar temporalmente mTLS entre los clusters
- Asignar IP públicas a todos los pods del mesh

## Solution

**Compartir la misma root CA / trust domain** es la respuesta correcta: La identidad federada requiere una raíz común: cada cluster con su propia CA autogenerada crea dos islas de confianza. Emita intermediates desde la misma raíz (o utilice federación SPIRE) antes de conectar los meshes.
