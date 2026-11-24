import { useSyncExternalStore } from "react";
import { desktopKeymap } from "../lib/desktopKeymap";
import { useSingleKeyShortcuts } from "../lib/singleKeyShortcuts";
import { Dialog } from "./Dialog";
import { strings } from "../strings";

interface ShortcutHelpProps {
  onClose: () => void;

  shortcuts?: readonly (readonly [string, string])[];

  desktop?: boolean;
}

export function ShortcutHelp({
  onClose,
  shortcuts = strings.keyboard.browserShortcuts,
  desktop = true,
}: ShortcutHelpProps) {
  const singleKeys = useSingleKeyShortcuts();

  return (
    <Dialog title={strings.keyboard.helpTitle} onClose={onClose}>
      <h3 className="shortcut-group">{strings.keyboard.helpBrowser}</h3>
      {!singleKeys && <p className="clipboard-hint">{strings.focus.singleKeysOff}</p>}
      <table className="shortcut-table">
        <tbody>
          {shortcuts.map(([keys, does]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{does}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {desktop && <DesktopShortcuts />}
    </Dialog>
  );
}

function DesktopShortcuts() {
  useSyncExternalStore(desktopKeymap.subscribe, desktopKeymap.getVersion, desktopKeymap.getVersion);
  const rows = desktopKeymap.rows();
  const showDesktop = desktopKeymap.isMac && desktopKeymap.enabled;

  return (
    <>
      <h3 className="shortcut-group">{strings.keyboard.helpDesktop}</h3>
      {showDesktop ? (
        <>
          <p className="clipboard-hint">{strings.keyboard.helpDesktopNote}</p>
          <table className="shortcut-table">
            <thead>
              <tr>
                <th>{strings.keyboard.colPress}</th>
                <th>{strings.keyboard.colSends}</th>
                <th>{strings.keyboard.colDoes}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.press}>
                  <td>
                    <kbd>{r.press}</kbd>
                  </td>
                  <td>
                    <kbd>{r.sends}</kbd>
                  </td>
                  <td>{r.describes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="clipboard-hint">{strings.keyboard.noneMac}</p>
      )}
    </>
  );
}
