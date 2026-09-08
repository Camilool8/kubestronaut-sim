## Question

Eliminó y volvió a crear un Service con el mismo nombre. Las aplicaciones que habían guardado la IP antigua dejaron de funcionar. ¿Qué lección de arquitectura refuerza esto?

## Options

- La IP antigua vuelve después de 24 h
- Deben utilizar directamente la IP del pod
- Los Services no pueden recrearse
- Los ClusterIP cambian cada vez que se recrea un Service

## Solution

**Los ClusterIP cambian cada vez que se recrea un Service** es la respuesta correcta: La IP se asigna dinámicamente desde el rango de Services al crear el objeto, salvo que spec.clusterIP la fije. El contrato estable de Kubernetes es el NOMBRE. La caché DNS del lado de la aplicación —especialmente JVM— merece atención después de recrearlo.
