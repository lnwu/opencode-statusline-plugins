/** @jsxImportSource @opentui/solid */
// Shared TUI pieces for the statusline plugins: usage polling, quota colors,
// the reset countdown, and the provider gate that hides the statusline for
// sessions on another provider.
//
// Like the rest of `core`, this module is inlined into each package's built
// `tui.js`, so the JSX still goes through the Solid transform and the runtime
// imports stay external (see `core/src/build.ts`).
import { usePlugin } from "@opencode/plugin/tui";
import type { RGBA } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/solid";
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { statusColors } from "./theme";

/** Usage refresh interval, in milliseconds. */
export const INTERVAL_MS = 60_000;

/** Footer width (columns) at which the reset countdowns are shown. */
export const DETAILED_WIDTH = 125;

/** Compact reset countdown (`2d3h`, `4h5m`, `37m`); undefined when not in the future. */
export function countdown(resetsAt: string | undefined, now: number): string | undefined {
  if (!resetsAt) return undefined;
  const ms = new Date(resetsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const minutes = Math.ceil(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${mins}m`;
  return `${mins}m`;
}

/**
 * Show reset countdowns when the footer details are expanded, or on terminals
 * wide enough to always afford them.
 */
export function useDetailed(showDetails: () => boolean): Accessor<boolean> {
  const dims = useTerminalDimensions();
  return () => showDetails() || dims().width >= DETAILED_WIDTH;
}

/**
 * Quota color: error at ≥90% (or a non-`ok` window status), info at ≥70%,
 * muted otherwise. Tokens that resolve to neither name render in the
 * terminal's default color (see `core/src/theme.ts`).
 */
export function quotaColor(theme: unknown, percent: number, ok = true): RGBA | undefined {
  const colors = statusColors<RGBA>(theme);
  if (!ok) return colors.error;
  if (percent >= 90) return colors.error;
  if (percent >= 70) return colors.info;
  return colors.muted;
}

/** The ` · ` between quota segments. */
export function Separator() {
  const ctx = usePlugin();
  return (
    <text fg={statusColors<RGBA>(ctx.theme).muted} flexShrink={0}>
      {" · "}
    </text>
  );
}

/**
 * Gate a statusline on the session's model provider: false while the session
 * is unknown or on another provider, true when `matches` accepts it. Refreshes
 * when the session selects another model, and ignores a stale check's result
 * when the session changed mid-flight.
 */
export function createProviderGate(
  sessionID: () => string | undefined,
  matches: (providerID: string | undefined) => boolean,
): Accessor<boolean> {
  const ctx = usePlugin();
  const [enabled, setEnabled] = createSignal(false);
  let generation = 0;

  async function check(id: string | undefined) {
    const current = ++generation;
    setEnabled(false);
    if (!id) return;
    try {
      await ctx.data.session.sync(id);
      if (current !== generation) return;
      setEnabled(matches(ctx.data.session.get(id)?.model?.providerID));
    } catch {
      if (current === generation) setEnabled(false);
    }
  }

  createEffect(() => {
    void check(sessionID());
  });

  onCleanup(
    ctx.data.on("session.model.selected", (event) => {
      if (event.data.sessionID === sessionID()) void check(sessionID());
    }),
  );

  return enabled;
}

/**
 * Fetch the usage immediately, then every `intervalMs` after each fetch
 * settles, so a slow RPC cannot stack overlapping requests. Returns the stop
 * function. A failing fetch is ignored so the next tick retries and the TUI
 * never crashes; the caller keeps rendering the last known value.
 */
export function startPolling(fetch: () => Promise<void>, intervalMs = INTERVAL_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = async () => {
    try {
      await fetch();
    } catch {
      // keep the last known usage; retry on the next interval
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
