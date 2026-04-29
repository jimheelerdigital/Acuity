import { Check } from "lucide-react";

/**
 * Single-source-of-truth checkbox primitive. Built to replace the
 * two divergent designs that existed pre-2026-04-28:
 *   - Open Tasks card on /home used h-5 w-5 rounded-full
 *   - /tasks task-list used a 16px square with inline borderRadius:4
 *     borderWidth:2
 *
 * Same action (mark task complete) reading as a circle on one screen
 * and a square on another was the most-flagged "feels slapped
 * together" issue in the polish audit. Now both callers use this
 * component.
 *
 * Visual choice: rounded-md square (4px corner radius). Square is
 * the canonical task-checkbox shape across iOS Reminders, macOS
 * Reminders, Things, Todoist. Avoids confusion with radio buttons
 * (which are circles) and matches what users expect.
 *
 * Render contract: caller provides `checked` + `onChange`. The
 * primitive handles its own visual states (idle / hover / checked)
 * and accessibility (role=checkbox, aria-checked).
 */

export function Checkbox({
  checked,
  onChange,
  ariaLabel,
  size = "md",
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  /**
   * Size key. md = 20px (default, matches /home + /tasks list rows),
   * lg = 24px for primary destructive flows where the affordance
   * needs more weight.
   */
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const dim = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  const iconSize = size === "lg" ? 14 : 12;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className={`grid ${dim} shrink-0 place-items-center rounded-md border-2 transition-all duration-150 ${
        checked
          ? "border-violet-500 bg-violet-500 hover:border-violet-600 hover:bg-violet-600 dark:border-violet-400 dark:bg-violet-400"
          : "border-zinc-300 bg-white hover:border-violet-500 hover:bg-violet-50 dark:border-white/20 dark:bg-transparent dark:hover:border-violet-400 dark:hover:bg-violet-950/30"
      } active:scale-95 disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {checked && (
        <Check
          className="text-white"
          size={iconSize}
          strokeWidth={3}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
