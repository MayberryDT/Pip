import type { PromptChip } from "@/lib/agent/card-types";

export function PromptChips({
  chips,
  compact = false,
  onSelect,
}: {
  chips: PromptChip[];
  compact?: boolean;
  onSelect: (chip: PromptChip) => void;
}) {
  if (chips.length === 0) {
    return null;
  }
  const trayClassName = [
    "pip-prompt-tray -mx-5 shrink-0 px-5 pb-0.5",
    compact ? "is-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const chipClassName = [
    "focus-ring ui-pressable pip-prompt-chip min-h-11 min-w-0 rounded-full border border-line bg-porcelain/50 px-2.5 py-1 text-[0.7rem] font-medium leading-[0.9rem] text-ink/90 shadow-[0_8px_22px_rgba(60,50,40,0.04)] hover:-translate-y-0.5 hover:bg-porcelain max-[380px]:text-[0.68rem] max-[380px]:leading-[0.84rem]",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={trayClassName}
      data-testid="prompt-chips"
    >
      <div className="pip-prompt-grid grid min-w-full grid-cols-2 gap-1.5">
        {chips.slice(0, 3).map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={chipClassName}
            onClick={() => onSelect(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
