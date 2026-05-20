"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCount } from "@/lib/format";
import { useToast } from "@/components/toast";

type Metric = "subscribers" | "views_30d";

type Goal = {
  id: string;
  channelId: number;
  metric: Metric;
  target: number;
  deadline: string; // ISO date YYYY-MM-DD
  createdAt: string;
};

const STORAGE_KEY = "reunifyd:goals";

function loadGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Goal[]) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals: Goal[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {}
}

const METRIC_LABEL: Record<Metric, string> = {
  subscribers: "Subscribers",
  views_30d: "Views (last 30 days)",
};

export function ChannelGoals({
  channelId,
  currentSubscribers,
  currentViews30d,
}: {
  channelId: number;
  currentSubscribers: number;
  currentViews30d: number;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<Metric>("subscribers");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    setNowMs(Date.now());
    setGoals(loadGoals().filter((g) => g.channelId === channelId));
  }, [channelId]);

  const sorted = useMemo(
    () =>
      [...goals].sort(
        (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
      ),
    [goals],
  );

  function persist(next: Goal[]) {
    const all = loadGoals().filter((g) => g.channelId !== channelId);
    saveGoals([...all, ...next]);
    setGoals(next);
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(target.replace(/[^0-9.]/g, ""));
    if (!num || num <= 0) {
      toast("Enter a positive target number", "error");
      return;
    }
    if (!deadline) {
      toast("Pick a deadline", "error");
      return;
    }
    const newGoal: Goal = {
      id: `${nowMs || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      metric,
      target: num,
      deadline,
      createdAt: new Date(nowMs || Date.now()).toISOString().slice(0, 10),
    };
    persist([...goals, newGoal]);
    setTarget("");
    setDeadline("");
    setShowForm(false);
    toast("Goal added", "success");
  }

  function onDelete(id: string) {
    persist(goals.filter((g) => g.id !== id));
    toast("Goal removed", "success");
  }

  const current = (m: Metric) =>
    m === "subscribers" ? currentSubscribers : currentViews30d;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Goals</h3>
          <p className="text-xs text-[var(--ink-2)]">
            Track progress toward subscriber and views milestones.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn"
          aria-expanded={showForm}
        >
          {showForm ? "Cancel" : "+ Add goal"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onAdd}
          className="mb-4 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-3)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <label className="text-xs">
            <span className="block text-[var(--ink-2)]">Metric</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            >
              <option value="subscribers">Subscribers</option>
              <option value="views_30d">Views (last 30 days)</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-[var(--ink-2)]">Target</span>
            <input
              type="number"
              min="1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 10000"
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-[var(--ink-2)]">Deadline</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            />
          </label>
          <button type="submit" className="btn primary self-end">
            Save
          </button>
        </form>
      ) : null}

      {sorted.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--ink-2)]">
          No goals yet. Add one to start tracking your milestones.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((g) => {
            const cur = current(g.metric);
            const pct = Math.max(0, Math.min(100, (cur / g.target) * 100));
            const reached = cur >= g.target;
            const daysLeft = nowMs
              ? Math.ceil((Date.parse(g.deadline) - nowMs) / 86_400_000)
              : 0;
            return (
              <li
                key={g.id}
                className="rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold">{METRIC_LABEL[g.metric]}</span>{" "}
                    <span className="text-[var(--ink-2)]">
                      → {formatCount(g.target)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--ink-2)]">
                    {reached ? (
                      <span className="font-semibold text-emerald-600">
                        ✓ Reached
                      </span>
                    ) : daysLeft < 0 ? (
                      <span className="font-semibold text-red-600">
                        Past due ({-daysLeft}d)
                      </span>
                    ) : (
                      <>by {g.deadline} · {daysLeft}d left</>
                    )}
                    <button
                      onClick={() => onDelete(g.id)}
                      className="ml-2 text-[var(--ink-3)] hover:text-red-600"
                      title="Delete goal"
                      aria-label="Delete goal"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      reached ? "bg-emerald-500" : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-[var(--ink-2)]">
                  <span>{formatCount(cur)} now</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
