import { useEffect, useRef, type ReactNode } from "react";

const LOADING_KEY = "loading";

const HEADING_WAIT_MS = 3000;

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(screenKey);
  const pending = useRef(false);

  useEffect(() => {
    if (previous.current !== screenKey) {
      pending.current = previous.current !== LOADING_KEY;
      previous.current = screenKey;
    }
    const screen = ref.current;
    if (!pending.current || !screen) return;

    const settle = (): boolean => {
      if (focusLost()) {
        const heading = screen.querySelector<HTMLElement>("h1");
        if (!heading) return false;
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus();
      }
      pending.current = false;
      return true;
    };
    if (settle()) return;

    const observer = new MutationObserver(() => {
      if (settle()) stop();
    });
    const timer = window.setTimeout(() => {
      pending.current = false;
      stop();
    }, HEADING_WAIT_MS);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    observer.observe(screen, { childList: true, subtree: true });
    return stop;
  }, [screenKey]);

  return (
    <div key={screenKey} ref={ref} className="screen">
      {children}
    </div>
  );
}
