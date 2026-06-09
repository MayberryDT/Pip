import type { PromptChip } from "@/lib/agent/card-types";

export function PromptChips({
  chips,
  onSelect,
}: {
  chips: PromptChip[];
  onSelect: (chip: PromptChip) => void;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      className="scrollbar-none -mx-5 overflow-x-auto overflow-y-visible px-5 pb-1"
      data-testid="prompt-chips"
    >
      <div className="flex w-max min-w-full flex-nowrap justify-center gap-2">
        {chips.slice(0, 3).map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="focus-ring h-10 min-w-max shrink-0 whitespace-nowrap rounded-full border border-line bg-porcelain/50 px-4 text-[0.82rem] font-medium leading-none text-ink/90 shadow-[0_8px_22px_rgba(60,50,40,0.04)] transition hover:-translate-y-0.5 hover:bg-porcelain max-[380px]:text-xs"
            onClick={() => onSelect(chip)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
