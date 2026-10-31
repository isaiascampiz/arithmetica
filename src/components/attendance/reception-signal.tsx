export function ReceptionSignal({ confirmed = false }: { confirmed?: boolean }) {
  return (
    <div className={'reception-signal' + (confirmed ? ' confirmed' : '')} aria-hidden="true">
      <svg viewBox="0 0 180 160" fill="none">
        <circle className="signal-ring ring-outer" cx="90" cy="80" r="64" />
        <circle className="signal-ring ring-inner" cx="90" cy="80" r="50" />
        <rect className="signal-core" x="52" y="42" width="76" height="76" rx="18" />
        {confirmed ? (
          <path className="signal-check" pathLength="1" d="m72 80 12 12 24-27" />
        ) : (
          <>
            <path className="signal-corners" d="M68 72v-8h8m28 0h8v8m0 16v8h-8m-28 0h-8v-8" />
            <rect className="signal-label" x="80" y="70" width="20" height="20" rx="3" />
            <path className="signal-label-lines" d="M85 77h10m-10 6h6" />
          </>
        )}
      </svg>
      <i className="signal-dot dot-one" />
      <i className="signal-dot dot-two" />
      <i className="signal-dot dot-three" />
    </div>
  );
}
