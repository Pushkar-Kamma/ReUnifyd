"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { groups } from "@/lib/groups";

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await groups.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/dashboard/groups/${r.group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-[min(640px,92vw)] py-10">
      <Link href="/dashboard/groups" className="text-sm text-[var(--accent)]">
        ← All groups
      </Link>
      <h1 className="mt-3 mb-2 text-3xl font-bold tracking-tight">New group</h1>
      <p className="mb-6 text-[var(--ink-2)]">
        Give your group a name. You&apos;ll add videos to compare on the next
        page.
      </p>

      <form onSubmit={onSubmit} className="card p-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            className="input-field"
            type="text"
            placeholder='e.g. "March product launch"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Description{" "}
            <span className="font-normal text-[var(--ink-2)]">(optional)</span>
          </span>
          <textarea
            className="input-field min-h-24 py-3"
            placeholder="What's in this group?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Link href="/dashboard/groups" className="btn">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn accent"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create group"}
          </button>
        </div>
      </form>
    </section>
  );
}
