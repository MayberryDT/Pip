import type { PromptChip } from "@/lib/agent/card-types";

export function PromptChips({
  chips,
  onSelect,
}: {
  chips: PromptChip[];
  onSelect: (chip: PromptChip) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-2 pb-1"
      data-testid="prompt-chips"
    >
      {chips.slice(0, 3).map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="focus-ring min-h-11 min-w-0 rounded-full border border-line bg-porcelain/50 px-2.5 py-2 text-[0.82rem] font-medium leading-tight text-ink/90 shadow-[0_8px_22px_rgba(60,50,40,0.04)] transition hover:-translate-y-0.5 hover:bg-porcelain max-[380px]:text-xs"
          onClick={() => onSelect(chip)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
