import type { ReactNode } from "react";

// One mark per certification, drawn here and bundled.
//
// These are deliberately NOT in Icon.tsx. That file is the product's
// functional UI glyphs — monochrome outlines on a 24 grid that take
// `currentColor` and mean "copy", "flag", "close". These mean *which
// exam*, they are tinted per engine through --exam-tint, and they are
// brand surface rather than affordance. Icon.tsx already documents the
// same boundary in the other direction for the orbit brand mark.
//
// **No Kubernetes, CNCF or Linux Foundation mark is used or implied**,
// which is the same rule ui/public/favicon.svg states in its own header.
// The certification badges published by the Linux Foundation are issued
// to individuals who pass an exam, for personal display; they are not
// available to a third-party product, and using them here would claim
// exactly the affiliation SECURITY.md and the About panel deny. So every
// mark below is original, and two shapes were rejected on that ground: a
// helm for CKA, which is essentially the Kubernetes logo, and a
// seven-spoke wheel for anything.
//
// The family resemblance is the orbit the product already owns — a ring
// with a body on it, as drawn in the favicon, the site hero and the
// link-preview card. KCNA is that figure exactly, because it is the
// entry point to the path. The rest carry the same stroke weight, the
// same 24 grid and the same round caps.
//
// Sized by CSS, not here: the tile is 44px on a live card and 38px on a
// coming-soon one, and the art has to hold at the smaller of those. Both
// were checked at both sizes before this shipped.

export type Certification = "KCNA" | "CKAD" | "CKA" | "CKS" | "KCSA";

const MARKS: Record<Certification, ReactNode> = {
  // The orbit itself: one ring, one body. The path's first certification
  // gets the product's own figure, undecorated.
  KCNA: (
    <>
      <circle cx="12" cy="12" r="6.3" />
      <circle cx="12" cy="5.7" r="2.15" fill="currentColor" stroke="none" />
    </>
  ),

  // Build and ship an application: a layered artifact, read top-down.
  CKAD: (
    <>
      <path d="M12 3.4l8.2 4.4L12 12.2 3.8 7.8z" />
      <path d="M3.8 12l8.2 4.4L20.2 12" />
      <path d="M3.8 16.2l8.2 4.4 8.2-4.4" />
    </>
  ),

  // Operate the cluster: a control plane and the nodes it drives. A node
  // graph rather than a hub-and-spoke wheel, so it cannot be read as the
  // Kubernetes helm — the three nodes are separate outlined bodies and
  // the links stop short of them.
  CKA: (
    <>
      <circle cx="12" cy="11.6" r="3.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.7" r="2.2" />
      <circle cx="19.1" cy="17.6" r="2.2" />
      <circle cx="4.9" cy="17.6" r="2.2" />
      <path d="M12 8.5V5.9M14.6 13.4l2.6 2.5M9.4 13.4l-2.6 2.5" />
    </>
  ),

  // Harden it: a shield, with the check that says it was verified rather
  // than merely attempted.
  CKS: (
    <>
      <path d="M12 2.9l7.4 2.8v6c0 4.7-3.2 7.1-7.4 8.4-4.2-1.3-7.4-3.7-7.4-8.4v-6z" />
      <path d="M9.1 11.9l2 2 3.8-3.9" />
    </>
  ),

  // Security fundamentals: a lock, deliberately not a second shield. CKS
  // already owns the shield and at 38px two shields are one shape. The
  // shackle is an orbit arc, which is what keeps it in the family.
  KCSA: (
    <>
      <rect x="4.4" y="10.6" width="15.2" height="10.2" rx="2.4" />
      <path d="M7.9 10.6V7.9a4.1 4.1 0 0 1 8.2 0v2.7" />
      <circle cx="12" cy="15.7" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
};

/** Every certification with a drawn mark. Exported for the test sweep. */
export const CERTIFICATIONS = Object.keys(MARKS) as Certification[];

export function hasCertMark(value: string | undefined): value is Certification {
  return value !== undefined && value in MARKS;
}

/**
 * The mark for a certification, or `null` if there is no drawing for it.
 *
 * A null return is a real case, not a bug: `banks/catalog.yaml` can
 * advertise a certification before anyone draws its mark, and the caller
 * falls back to the acronym rather than rendering an empty tile.
 *
 * `aria-hidden` is hardcoded and there is no label prop, the same
 * contract Icon.tsx holds: the certification is already the heading
 * beside this, so by construction the mark is never the only carrier of
 * meaning and no later call site can make it one.
 */
export function CertMark({ certification }: { certification: string | undefined }) {
  if (!hasCertMark(certification)) return null;
  return (
    <svg
      className="cert-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARKS[certification]}
    </svg>
  );
}
