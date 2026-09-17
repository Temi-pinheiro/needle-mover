"use client";

import { useState, useTransition } from "react";
import {
  disconnectCalendar,
  removeWorkspace,
  setWorkspaceFlag,
  type SettingsResult,
} from "@/app/settings/actions";

/** Submits a server action and shows whatever it says back. */
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (formData: FormData) => Promise<SettingsResult>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsResult | null>(null);

  return (
    <form
      action={(formData) => start(async () => setResult(await action(formData)))}
      className="space-y-5"
    >
      {children}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="pressable rounded-md bg-cta px-5 py-2.5 text-sm font-medium text-cta-ink hover:bg-cta-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {result && (
          <p
            role="status"
            className={`text-[13px] ${result.ok ? "text-pale-green-ink" : "text-pale-red-ink"}`}
          >
            {result.note}
          </p>
        )}
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-line bg-surface-sunken px-4 py-2.5 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-ink"
      />
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cta)]"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-faint">{hint}</span>}
      </span>
    </label>
  );
}

/** A flag that saves the moment it is flipped. */
export function InstantToggle({
  label,
  workspaceId,
  field,
  checked,
}: {
  label: string;
  workspaceId: string;
  field: "active" | "is_private";
  checked: boolean;
}) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(checked);

  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const result = await setWorkspaceFlag(workspaceId, field, next);
            if (!result.ok) setOn(!next); // put it back if the write failed
          });
        }}
        className="h-4 w-4 accent-[var(--cta)]"
      />
      <span className="text-[13px] text-ink-soft">{label}</span>
    </label>
  );
}

/** Removal, gated on typing the venture's name. */
export function RemoveWorkspace({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pressable text-[13px] text-ink-faint transition-colors hover:text-pale-red-ink"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Type "${name}"`}
        className="w-40 rounded-md border border-line bg-surface-sunken px-3 py-1.5 text-[13px] outline-none focus:border-pale-red-ink"
      />
      <button
        disabled={pending}
        onClick={() => start(async () => setNote((await removeWorkspace(workspaceId, value)).note ?? null))}
        className="pressable rounded-md bg-pale-red-ink px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
      >
        Remove
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setValue("");
          setNote(null);
        }}
        className="pressable px-2 py-1.5 text-[13px] text-ink-muted"
      >
        Cancel
      </button>
      {note && <p className="w-full text-right text-[12px] text-pale-red-ink">{note}</p>}
    </div>
  );
}

/** Disconnecting the calendar, with the result shown rather than swallowed. */
export function DisconnectCalendar() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        disabled={pending}
        onClick={() => start(async () => setNote((await disconnectCalendar()).note ?? null))}
        className="pressable rounded-md border border-line px-4 py-2 text-[13px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? "Disconnecting…" : "Disconnect"}
      </button>
      {note && <p className="text-[12px] text-ink-faint">{note}</p>}
    </div>
  );
}
