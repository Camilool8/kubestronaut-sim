import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Latin only, matching the four faces site/build.sh vendors for the landing
// page. The whole-family entrypoints pull cyrillic, cyrillic-ext, greek,
// latin-ext and vietnamese as well; `unicode-range` keeps the browser from
// fetching them, but every subset still lands in dist/ and its @font-face
// block still ships in the stylesheet. Nothing this product renders is
// outside latin.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./theme.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// The markdown renderer is split out of the entry chunk (see Markdown.tsx): no
// screen before the first question needs it. Warm it once the boot screen has
// painted, so the question pane never waits on a fetch it could have started
// minutes earlier. Failure is not worth reporting -- the Suspense boundary
// retries on render.
const warmMarkdown = () => {
  void import("./components/MarkdownRenderer").catch(() => {});
};
if (typeof window.requestIdleCallback === "function") {
  window.requestIdleCallback(warmMarkdown, { timeout: 2000 });
} else {
  window.setTimeout(warmMarkdown, 1000);
}
