export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#101728" />
      <circle cx="16" cy="16" r="8.3" fill="none" stroke="#6f9cf8" strokeWidth="1.6" />
      <circle cx="25.1" cy="6.9" r="3.2" fill="#8fd6a8" />
      <circle cx="6.9" cy="25.1" r="2.1" fill="#e8c46a" />
    </svg>
  );
}
