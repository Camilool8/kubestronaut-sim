# Clipboard sync — the host clipboard and the exam desktop, in both directions

Date: 2026-07-28

## The problem

A candidate highlights the text of question 1, presses ⌘C, clicks into
the exam terminal, and pastes. Nothing arrives. The same thing happens
with anything copied from outside the browser — a manifest from an
editor, a command from a notes app.

Two separate defects sit behind that one symptom, and one widely-held
assumption about a third turned out to be wrong.

## What was measured

Against a live exam in Chrome on macOS, `localhost:8080`:

| Check | Result |
|---|---|
| `window.isSecureContext` | `true` |
| `navigator.clipboard.readText` | present, permission `granted` |
| `readText()` with the document focused | returns the host clipboard |
| Real Ctrl+V over the canvas | interception fires, no warning toast, one cut-text sent |
| Copy button outcome | `copiedToDesktop` — the RFB push reports success |
| Right-click → Paste in the remote terminal | **pastes correctly** |

The last row is the important one. The RFB extended-clipboard handshake
completes, and the remote X CLIPBOARD really is populated. An earlier
reading of "zero `ServerCutText` messages" suggested the transfer was
broken; it was inconclusive, because the synthetic keystrokes used to
trigger the paste never reached the terminal as a paste at all. The
transport is sound and needs no change.

## Root causes

**Nothing pushes arbitrary host clipboard content.** `desktopClipboard`
only ever writes to the desktop from an explicit click on a copy control
— `CopyableCode` for inline values, `CodeBlock` for fenced listings.
Question 1 renders eight inline copy buttons and zero code blocks, so
there is no control that copies prose at all. A mouse selection plus ⌘C
reaches the host clipboard and stops there. The only bridges from host to
desktop are ⌘V/Ctrl+V and the Clipboard panel's Send button.

**The synthesized paste chord is malformed.** `sendPasteChord()` sends
`keysym: XK.v` — `0x0076`, lowercase `v` — while holding `Shift_L`. The
`XK` table carries lowercase letters only. Holding Shift while naming an
unshifted keysym is an inconsistent pair, and xfce4-terminal's
Ctrl+Shift+V accelerator does not match it; the terminal forwards a plain
Ctrl+V to the application instead. In vim that renders as `^`, readline's
verbatim-insert prefix — precisely the failure the comment at
`DesktopViewport.tsx:166` claims to have removed. Every chord with
`shift: true` shares the defect: `meta+c`, `meta+v`, `meta+t`, `meta+w`.
⌘C on a Mac is broken for the same reason.

## Decisions

### A dedicated sync module

`ui/src/lib/clipboardSync.ts`, a module singleton in the established
shape of `desktopClipboard`, `desktopKeymap` and `desktopResize`. It owns
the window-level listeners and depends on `desktopClipboard` for
transport. The Exam screen starts and stops it.

It does **not** live in `DesktopViewport`'s effect. That effect is scoped
to the canvas mount because it intercepts keys aimed at the remote
desktop. `copy`, `cut` and `focus` are application-wide events with no
relationship to the canvas, and putting them there would tie their
lifetime to a viewport that remounts on reconnect.

### Host → desktop, two triggers

**A `copy`/`cut` listener on the window.** Read
`document.getSelection().toString()`; if it is non-empty and a desktop is
connected, push it with `sendToDesktop`. This needs no clipboard
permission in any browser, and it is the path that makes highlighting a
question and pressing ⌘C work.

The existing copy buttons use `navigator.clipboard.writeText`, which is a
programmatic write and does not raise a `copy` event, so they keep their
current explicit push and nothing is sent twice.

**A `focus` / `visibilitychange` listener, plus one read on start.** Call
`readText()` and push when the value differs from the last synced value.
This is the half that covers other applications, and the half Firefox
cannot do — it has no `readText` for web content. A refusal is a silent
no-op: this runs on every tab focus, so a toast would be noise rather
than information. The Clipboard panel remains the documented fallback and
its copy already says so.

### Desktop → host

`desktopClipboard.receive()` already fires on every remote clipboard
change and currently only parks the text for the panel. When the document
is focused, write it to the host with `writeText`. Chrome grants
`clipboard-write` to the focused tab, so this needs no gesture. Firefox
will refuse; the panel's existing button stays for that case.

### Loop prevention

With both directions automatic the naive implementation ping-pongs: the
page writes X to the host, the next focus reads X back, and pushes it to
the desktop again.

One `lastSynced` string, held in `clipboardSync` and consulted by both
directions, is the guard. A value that arrived from one side is never
sent back to it. Both directions compare before sending and update it
after. The ⌘V/Ctrl+V path below is itself a host → desktop push and obeys
the same rule, so a keystroke paste cannot desynchronise the guard. This
is the single piece of state in the module and the one most worth
testing.

### The chord fix

Add the shifted keysyms to the `XK` table — `V` `0x0056`, `C` `0x0043`,
`T` `0x0054`, `W` `0x0057` — and send the shifted keysym whenever a chord
sets `shift: true`. This repairs `sendPasteChord()` and, with it, ⌘C, ⌘T
and ⌘W.

⌘V/Ctrl+V keeps its fresh `readText` → push → send-chord sequence rather
than relying on the ambient sync, so a paste is current even when a focus
event was missed. When the read is refused it falls back to sending the
chord alone, which now pastes whatever the ambient sync last delivered.

The chord stays Ctrl+Shift+V unconditionally. Detecting which remote
window has focus would need a helper inside the desktop container
reporting the active X window over a side channel — real complexity for
the rare case of pasting into the desktop's Firefox, where right-click
paste already works.

## Testing

Unit tests for `clipboardSync` with a mocked `navigator.clipboard` and a
fake RFB target, matching the style of `desktopClipboard.test.ts`:
selection copy pushes, focus read pushes only on change, a value received
from the desktop is not pushed back, and a refused `readText` is silent.

A keysym assertion that every chord with `shift: true` sends the
uppercase keysym. That is the exact regression that shipped.

**A browser check is part of done, not optional.** The existing suite
stubs `navigator.clipboard` and asserts the blocked path correctly, which
is why a bug in the real chord survived it. Verify in Chrome: highlight
question prose, ⌘C, then both right-click → Paste and ⌘V in the terminal.

## Deliberately not done

**No "copy whole question" button.** The requirement is that anything
highlighted and copied reaches the desktop, whatever its source. A button
would solve one case and leave every other one broken.

**No change to the copy buttons.** They are precise, they work, and they
remain the fastest way to move a single resource name.

**No focused-remote-window detection.** See the chord decision above.

**No polling.** Reading the clipboard on an interval would keep the
desktop current within a second or two, but it burns a permission-gated
API in a loop for a case that `focus` already covers.
