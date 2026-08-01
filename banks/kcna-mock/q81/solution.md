**Continuous delivery leaves a final, manual approval gate before a release reaches production; continuous deployment releases every change that passes its pipeline straight to production automatically** is correct: both practices assume code is kept in a continuously releasable state through automated building and testing. The difference is entirely about that last step — delivery stops just short of production and waits for a human decision, while deployment removes that gate and ships automatically.

Why the others are wrong:

- **Continuous delivery only applies to containerized applications; continuous deployment applies to any application** — neither practice is tied to any particular packaging technology; both predate widespread container adoption and apply equally to containerized and non-containerized software.
- **Continuous deployment runs tests before merging; continuous delivery runs tests after merging** — both practices run their automated test suites as part of the same pipeline, before a release candidate is considered ready; the distinction is not about test ordering.
- **Continuous delivery requires a canary release; continuous deployment requires a blue-green release** — canary and blue-green are release STRATEGIES that either practice can use during its final rollout step; neither delivery nor deployment mandates one specific strategy.
