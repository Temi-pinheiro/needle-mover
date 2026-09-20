"use client";

import { useState, useTransition } from "react";
import { listTeams, setWorkspaceTeam, type TeamOption } from "@/app/settings/actions";

/**
 * Which Linear team a venture covers.
 *
 * Teams are fetched when the picker is opened rather than on page load: it is
 * one Linear round-trip per venture, and most visits to this page are not
 * about changing scope.
 */
export function TeamScope({
  workspaceId,
  teamKey,
}: {
  workspaceId: string;
  teamKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<TeamOption[] | null>(null);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function openPicker() {
    setOpen(true);
    if (teams) return;
    start(async () => {
      try {
        setTeams(await listTeams(workspaceId));
      } catch (err) {
        setNote(err instanceof Error ? err.message : String(err));
        setTeams([]);
      }
    });
  }

  function choose(team: TeamOption | null) {
    start(async () => {
      const result = await setWorkspaceTeam(workspaceId, team);
      setNote(result.note ?? null);
      if (result.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={openPicker}
        className="pressable linkish text-[13px] text-ink-faint transition-colors hover:text-ink"
      >
        {teamKey ? `Team ${teamKey}` : "Whole org"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {pending && !teams && <span className="text-[12px] text-ink-faint">Loading teams…</span>}
        {teams?.map((team) => (
          <button
            key={team.id}
            disabled={pending}
            onClick={() => choose(team)}
            className={`pressable rounded-lg border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
              team.key === teamKey
                ? "border-ink bg-cta text-cta-ink"
                : "border-line text-ink-soft hover:border-line-strong"
            }`}
          >
            {team.key}
          </button>
        ))}
        {teams && (
          <button
            disabled={pending}
            onClick={() => choose(null)}
            className={`pressable rounded-lg border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
              teamKey === null ? "border-ink bg-cta text-cta-ink" : "border-line text-ink-soft"
            }`}
          >
            Whole org
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="pressable px-1.5 py-1 text-[12px] text-ink-muted"
        >
          Close
        </button>
      </div>
      {note && <p className="max-w-[34ch] text-right text-[12px] text-ink-faint">{note}</p>}
    </div>
  );
}
