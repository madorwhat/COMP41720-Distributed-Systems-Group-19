const PATHS = {
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h2M8 16h5" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5M8 10.8l2 2 3.8-4" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
};

export default function Icon({ name, size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}