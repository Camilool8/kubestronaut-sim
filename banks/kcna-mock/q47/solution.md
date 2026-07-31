**Compiling the code, running unit tests, and building the container image** is correct: continuous integration is about frequently merging code and automatically verifying it—compiling, running automated tests, and producing a build artifact such as a container image. CI ends with a tested artifact ready to be delivered; getting that artifact into environments is CD's job.

Why the others are wrong:

- **Promoting a release from the staging environment to production** — Moving a built artifact between environments is a delivery/deployment activity, so it belongs to the CD side of the pipeline.
- **Shifting a percentage of live traffic to a new version** — Traffic shifting is part of a progressive delivery strategy (such as a canary release) executed during deployment, not during integration and build.
- **Rolling back a failed release in the production cluster** — Rollbacks are an operational deployment concern handled by CD tooling or the cluster itself, well after CI has finished building and testing the artifact.
