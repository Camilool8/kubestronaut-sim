# Question 11 | Helm release management

*Solve this question on instance: `ssh instance-1`*

Team Carina manages its workloads with Helm in Namespace `carina`. The
chart repository `sim` is already configured on this instance.

Perform all four:

1. Uninstall the release `report-api-v1`.
2. Upgrade the release `report-api-v2` to a **newer version** of chart
   `sim/sim-web` than the one it currently runs.
3. Install a new release named `report-cache` of chart `sim/sim-cache`.
   Its Deployment must have **2 replicas**, set through Helm values at
   install time — not by editing or scaling the Deployment afterwards.
4. One release in this Namespace is in a **failed** state. Find it and
   uninstall it.

Leave `report-web` alone.
