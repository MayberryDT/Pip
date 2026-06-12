const comparisonRows = [
  {
    current: "Bank balance",
    happens: "Looks like permission",
    pip: "Shows daily room",
  },
  {
    current: "Budget app",
    happens: "Requires upkeep",
    pip: "One number first",
  },
  {
    current: "Spreadsheet",
    happens: "Too much work",
    pip: "No tracking ritual",
  },
  {
    current: "Ignoring money",
    happens: "Easy now, worse later",
    pip: "Tiny daily check",
  },
];

export function BehaviorComparison() {
  return (
    <div className="overflow-hidden rounded-[0.5rem] border border-line bg-paper shadow-[0_14px_36px_rgba(60,50,40,0.06)]">
      <div className="grid bg-porcelain px-5 py-3 text-xs font-bold uppercase tracking-normal text-moss md:grid-cols-3">
        <span>Current default</span>
        <span className="hidden md:block">What happens</span>
        <span className="hidden md:block">Pip instead</span>
      </div>
      <div className="divide-y divide-line">
        {comparisonRows.map((row) => (
          <div className="grid gap-3 px-5 py-4 text-sm leading-6 md:grid-cols-3" key={row.current}>
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-taupe md:hidden">Current default</p>
              <p className="font-bold text-ink">{row.current}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-taupe md:hidden">What happens</p>
              <p className="text-ink/66">{row.happens}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-taupe md:hidden">Pip instead</p>
              <p className="font-bold text-moss">{row.pip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
