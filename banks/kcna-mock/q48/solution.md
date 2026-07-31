**In a container registry such as an OCI-compliant artifact registry** is correct: the final step of a CI build for a containerized application is pushing the image to a registry (for example Docker Hub, Harbor, or a cloud provider registry). Kubernetes nodes then pull the image from that registry by its tag or digest whenever a Pod referencing it is scheduled.

Why the others are wrong:

- **In the Git repository next to the application source code** — Git stores source code and declarative configuration; large binary image layers do not belong there, and Kubernetes cannot pull images from a Git repository.
- **In a ConfigMap inside the target cluster** — ConfigMaps hold small pieces of configuration data (with a 1 MiB size limit) and are not a mechanism for storing or distributing container images.
- **On the local disk of each worker node ahead of time** — While nodes cache pulled images locally, manually pre-loading every node does not scale and is not how images are distributed; nodes pull from a registry on demand.
