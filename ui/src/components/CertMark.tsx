import type { ReactNode } from "react";

export type Certification = "KCNA" | "CKAD" | "CKA" | "CKS" | "KCSA";

const MARKS: Record<Certification, ReactNode> = {
  KCNA: (
    <>
      <circle cx="12" cy="12" r="6.3" />
      <circle cx="12" cy="5.7" r="2.15" fill="currentColor" stroke="none" />
    </>
  ),

  CKAD: (
    <>
      <path d="M12 3.4l8.2 4.4L12 12.2 3.8 7.8z" />
      <path d="M3.8 12l8.2 4.4L20.2 12" />
      <path d="M3.8 16.2l8.2 4.4 8.2-4.4" />
    </>
  ),

  CKA: (
    <>
      <circle cx="12" cy="11.6" r="3.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.7" r="2.2" />
      <circle cx="19.1" cy="17.6" r="2.2" />
      <circle cx="4.9" cy="17.6" r="2.2" />
      <path d="M12 8.5V5.9M14.6 13.4l2.6 2.5M9.4 13.4l-2.6 2.5" />
    </>
  ),

  CKS: (
    <>
      <path d="M12 2.9l7.4 2.8v6c0 4.7-3.2 7.1-7.4 8.4-4.2-1.3-7.4-3.7-7.4-8.4v-6z" />
      <path d="M9.1 11.9l2 2 3.8-3.9" />
    </>
  ),

  KCSA: (
    <>
      <rect x="4.4" y="10.6" width="15.2" height="10.2" rx="2.4" />
      <path d="M7.9 10.6V7.9a4.1 4.1 0 0 1 8.2 0v2.7" />
      <circle cx="12" cy="15.7" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
};

export const CERTIFICATIONS = Object.keys(MARKS) as Certification[];

export function hasCertMark(value: string | undefined): value is Certification {
  return value !== undefined && value in MARKS;
}

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
