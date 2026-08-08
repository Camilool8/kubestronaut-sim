The platform team has extended this cluster's API with a resource type of
their own, whose kind is `FeatureToggle`. Nothing about it is written
down here — find it on the cluster.

1. Save the **fully-qualified name** of the CustomResourceDefinition that
   registers that kind to `/opt/course/29/crd-name` on `instance-1`. One
   line, the name only.
2. Namespace `sextans` already holds one resource of that kind. Save its
   name — the name alone — to `/opt/course/29/existing-toggle`.
3. Create a second resource of that kind in `sextans`, named `dark-mode`,
   with its `enabled` field set to true, its `rollout` field set to `25`
   and its `owner` field set to `platform-team`.
