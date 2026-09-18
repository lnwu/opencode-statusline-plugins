/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { UsageRpc, type Usage } from "./rpc"

const INTERVAL_MS = 60000
const DETAILED_WIDTH = 125
const COPILOT_PROVIDER_ID = "github-copilot"

function countdown(resetsAt: string, now: number) {
  const ms = new Date(resetsAt).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const minutes = Math.ceil(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d${hours}h`
  if (hours > 0) return `${hours}h${mins}m`
  return `${mins}m`
}

function Segment(props: { usage: Usage; color: () => RGBA; detailed: boolean }) {
  const text = () => {
    if (props.usage.unlimited) return "∞"
    const left = props.detailed && props.usage.resetsAt ? countdown(props.usage.resetsAt, Date.now()) : undefined
    return `${props.usage.usedPercent}%${left ? ` (${left})` : ""}`
  }
  return (
    <text fg={props.color()} wrapMode="none" flexShrink={1}>
      {text()}
    </text>
  )
}

function CopilotUsage(props: {
  sessionID: () => string | undefined
  showDetails: () => boolean
  usage: () => Usage | undefined
  loaded: () => boolean
}) {
  const ctx = usePlugin()
  const [isCopilot, setIsCopilot] = createSignal(false)
  const dims = useTerminalDimensions()
  const detailed = () => props.showDetails() || dims().width >= DETAILED_WIDTH

  // One color for the whole segment, so the label follows the percentage.
  // `loaded` separates "first fetch still running" (subdued) from "no data"
  // (error): an unresolvable credential or a failing API is a failure, not a
  // loading state.
  const fg = () => {
    const t = ctx.theme
    const u = props.usage()
    if (!u) return props.loaded() ? t.text.feedback.error.default : t.text.subdued
    if (u.unlimited) return t.text.subdued
    if (u.usedPercent >= 90) return t.text.feedback.error.default
    if (u.usedPercent >= 70) return t.text.feedback.info.default
    return t.text.subdued
  }

  let generation = 0
  async function check(id: string | undefined) {
    const current = ++generation
    setIsCopilot(false)
    if (!id) return
    try {
      await ctx.data.session.sync(id)
      if (current !== generation) return
      setIsCopilot(ctx.data.session.get(id)?.model?.providerID === COPILOT_PROVIDER_ID)
    } catch {
      if (current === generation) setIsCopilot(false)
    }
  }

  createEffect(() => {
    void check(props.sessionID())
  })

  onCleanup(
    ctx.data.on("session.model.selected", (event) => {
      if (event.data.sessionID === props.sessionID()) void check(props.sessionID())
    }),
  )

  return (
    <Show when={isCopilot()}>
      <box flexDirection="row" flexShrink={1} minWidth={0}>
        <text fg={fg()} flexShrink={0}>
          Copilot{" "}
        </text>
        <Show
          when={props.usage()}
          fallback={
            <text fg={fg()} flexShrink={0}>
              —
            </text>
          }
        >
          {(u) => <Segment usage={u()} color={fg} detailed={detailed()} />}
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode-copilot-statusline.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc)
    const [usage, setUsage] = createSignal<Usage>()
    const [loaded, setLoaded] = createSignal(false)
    let timer: ReturnType<typeof setInterval> | undefined

    async function refresh() {
      try {
        const result = (await rpc.get({})) as { usage?: Usage }
        if (result?.usage) setUsage(result.usage)
      } catch {
        // keep the last known usage; retry on the next interval
      } finally {
        setLoaded(true)
      }
    }

    void refresh()
    timer = setInterval(() => void refresh(), INTERVAL_MS)

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <CopilotUsage
          sessionID={() => input.sessionID}
          showDetails={() => input.showDetails}
          usage={usage}
          loaded={loaded}
        />
      ),
    })

    return () => {
      if (timer) clearInterval(timer)
      unregister()
    }
  },
})
