import type { ReactNode } from "react";

export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  return (
    <div key={screenKey} className="screen">
      {children}
    </div>
  );
}
