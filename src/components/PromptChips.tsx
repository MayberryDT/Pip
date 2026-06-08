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
      className="-mx-1 flex gap-2 overflow-x-auto overflow-y-hidden px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="prompt-chips"
    >
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
  );
}
