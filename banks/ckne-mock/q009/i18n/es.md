## Question

Según la especificación CNI, ¿qué hace el container runtime cuando se crea un pod?

## Options

- Envía un CRD NetworkRequest al apiserver
- Escribe directamente en las tablas de rutas del netns del pod
- Llama a la API REST del plugin CNI mediante HTTPS
- Ejecuta el binario del plugin con CNI_COMMAND=ADD y pasa la configuración por stdin

## Solution

**Ejecuta el binario del plugin con CNI_COMMAND=ADD y pasa la configuración por stdin** es la respuesta correcta: CNI es un contrato de ejecución de binarios: el runtime ejecuta el plugin con variables de entorno como `CNI_COMMAND=ADD`, `CNI_NETNS`, `CNI_IFNAME`, y la configuración JSON mediante stdin. El plugin devuelve JSON con IP y rutas. DEL se llama al eliminar el pod.
