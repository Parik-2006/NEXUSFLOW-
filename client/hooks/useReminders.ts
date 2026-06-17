/**
 * useReminders.ts — Feature 4: task reminder engine.
 * ---------------------------------------------------------------------------------
 * Derives actionable alerts from live task state (reuses useTeamTasks → same
 * socket stream, no extra backend). Surfaces:
 *   • Overdue tasks            (critical)
 *   • Deadlines approaching    (warning, ≤2 days)
 *   • Assignment impossible    (warning, from Branch & Bound assign:warning)
 *   • Dependency cycle / sprint overflow hooks are exposed for callers that have
 *     that context (GraphPanel / SprintPanel) via addExternal().
 *
 * Returned `reminders` feed the NotificationCenter and toast surfaces.
 */
import { useMemo } from "react";
import { useTeamTasks } from "@/hooks/useTeamTasks";
import { deadlineMeta } from "@/theme";

export type Severity = "critical" | "warning" | "info";
export type Reminder = {
  id: string;
  severity: Severity;
  icon: string;
  title: string;
  message: string;
};

export type UpcomingReminder = { taskId: string; title: string; at: string; whenMs: number };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function useReminders(teamId: string) {
  const { rawTasks, assignWarning } = useTeamTasks(teamId);

  const reminders = useMemo<Reminder[]>(() => {
    const out: Reminder[] = [];
    const active = rawTasks.filter((t) => t.status !== "done");
    const now = Date.now();

    for (const t of active) {
      const m = deadlineMeta(t.dueDate ?? t.deadline);
      if (m.overdue) {
        out.push({ id: `overdue_${t._id}`, severity: "critical", icon: "alert-circle", title: "Task overdue", message: `"${t.title}" — ${m.text}.` });
      } else if (m.band === "urgent") {
        out.push({ id: `soon_${t._id}`, severity: "warning", icon: "time", title: "Deadline approaching", message: `"${t.title}" — ${m.text}.` });
      }

      // User-set reminders (manual reminderAt input).
      if (t.reminderAt) {
        const when = new Date(t.reminderAt).getTime();
        if (Number.isFinite(when)) {
          if (when <= now) {
            out.push({ id: `rem_due_${t._id}`, severity: "warning", icon: "notifications", title: "Reminder due", message: `"${t.title}" — set for ${fmt(t.reminderAt)}.` });
          } else if (when - now <= 48 * 3_600_000) {
            out.push({ id: `rem_soon_${t._id}`, severity: "info", icon: "notifications-outline", title: "Upcoming reminder", message: `"${t.title}" — ${fmt(t.reminderAt)}.` });
          }
        }
      }
    }

    if (assignWarning) {
      out.push({ id: "assign_warn", severity: "warning", icon: "git-branch", title: "Assignment blocked", message: assignWarning });
    }

    const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [rawTasks, assignWarning]);

  // Future user reminders (for the upcoming-reminder widget), sorted soonest-first.
  const upcoming = useMemo<UpcomingReminder[]>(() => {
    const now = Date.now();
    return rawTasks
      .filter((t) => t.status !== "done" && t.reminderAt && new Date(t.reminderAt!).getTime() > now)
      .map((t) => ({ taskId: t._id, title: t.title, at: t.reminderAt!, whenMs: new Date(t.reminderAt!).getTime() }))
      .sort((a, b) => a.whenMs - b.whenMs);
  }, [rawTasks]);

  const counts = useMemo(() => ({
    total: reminders.length,
    critical: reminders.filter((r) => r.severity === "critical").length,
    warning: reminders.filter((r) => r.severity === "warning").length,
  }), [reminders]);

  // Reminder states (Phase 7): Upcoming (future) · Due Today · Missed (past).
  const reminderStates = useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(now);
    let upcomingN = 0, todayN = 0, missed = 0;
    for (const t of rawTasks) {
      if (t.status === "done" || !t.reminderAt) continue;
      const at = new Date(t.reminderAt).getTime();
      if (Number.isNaN(at)) continue;
      const day = startOfDay(new Date(at));
      if (at < now.getTime() && day < today) missed++;       // a past day
      else if (day === today) todayN++;                       // today
      else if (at < now.getTime()) missed++;                  // earlier today, passed
      else upcomingN++;                                        // future
    }
    return { upcoming: upcomingN, today: todayN, missed };
  }, [rawTasks]);

  return { reminders, upcoming, counts, reminderStates };
}
