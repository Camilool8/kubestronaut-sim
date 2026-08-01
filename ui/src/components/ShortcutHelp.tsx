import { useSyncExternalStore } from "react";
import { desktopKeymap } from "../lib/desktopKeymap";
import { Dialog } from "./Dialog";
import { strings } from "../strings";

interface ShortcutHelpProps {
  onClose: () => void;
}

/**
 * The shortcut reference, as a modal — unlike the keyboard settings
 * popover. This one is a table you read and dismiss, not a control you
 * flick while watching the desktop, so taking over the screen is the
 * right shape for it.
 */
export function ShortcutHelp({ onClose }: ShortcutHelpProps) {
  // Subscribed so toggling the remap in the settings popover updates
  // this table underneath it.
  useSyncExternalStore(desktopKeymap.subscribe, desktopKeymap.getVersion, desktopKeymap.getVersion);
  const rows = desktopKeymap.rows();
  const showDesktop = desktopKeymap.isMac && desktopKeymap.enabled;

  return (
    <Dialog title={strings.keyboard.helpTitle} onClose={onClose}>
      <h3 className="shortcut-group">{strings.keyboard.helpBrowser}</h3>
      <table className="shortcut-table">
        <tbody>
          {strings.keyboard.browserShortcuts.map(([keys, does]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{does}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
    </Dialog>
  );
}
