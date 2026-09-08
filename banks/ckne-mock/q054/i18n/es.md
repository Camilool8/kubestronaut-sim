## Question

En un archivo .conflist de CNI, ¿cuál es la finalidad del array "plugins" con varias entradas (por ejemplo, cilium, portmap, bandwidth)?

## Options

- Elegir el plugin según el namespace del pod
- Ejecutar cada plugin en un nodo diferente
- Definir plugins alternativos que solo se utilizan si falla el primero
- Encadenamiento: los plugins se ejecutan en secuencia

## Solution

**Encadenamiento: los plugins se ejecutan en secuencia** es la respuesta correcta: El chaining de CNI ejecuta los plugins en orden: el primero (main) crea y configura la interfaz; los encadenados reciben el resultado anterior (prevResult) y añaden capacidades como `portmap` (hostPort) y `bandwidth` (annotations kubernetes.io/ingress-bandwidth).
