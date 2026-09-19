/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { resolveLanguage, type Language } from "core/language"
import { statusColors } from "core/theme"
import { UsageRpc, type Usage, type UsageWindow } from "./rpc"

const INTERVAL_MS = 60000
const DETAILED_WIDTH = 125
const KIMI_PROVIDER_IDS = new Set(["kimi-code-plan-global", "kimi-code-plan-cn"])

const LABELS = {
  en: { rolling: "5h", weekly: "Weekly" },
  "zh-CN": { rolling: "5h", weekly: "周" },
} as const

type Labels = (typeof LABELS)[Language]

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

function Segment(props: { label: string; win: UsageWindow; detailed: boolean }) {
  const ctx = usePlugin()
  const fg = () => {
    const colors = statusColors<RGBA>(ctx.theme)
    if (props.win.percent >= 90) return colors.error
    if (props.win.percent >= 70) return colors.info
    return colors.muted
  }
  const text = () => {
    const left = props.detailed && props.win.resetsAt ? countdown(props.win.resetsAt, Date.now()) : undefined
    return `${props.label} ${props.win.percent}%${left ? ` (${left})` : ""}`
  }
  return (
    <text fg={fg()} wrapMode="none" flexShrink={1}>
      {text()}
    </text>
  )
}

function Separator() {
  const ctx = usePlugin()
  return (
    <text fg={statusColors<RGBA>(ctx.theme).muted} flexShrink={0}>
      {" · "}
    </text>
  )
}

function KimiUsage(props: {
  sessionID: () => string | undefined
  showDetails: () => boolean
  usage: () => Usage | undefined
  labels: Labels
}) {
  const ctx = usePlugin()
  const [isKimi, setIsKimi] = createSignal(false)
  const dims = useTerminalDimensions()
  const detailed = () => props.showDetails() || dims().width >= DETAILED_WIDTH

  let generation = 0
  async function check(id: string | undefined) {
    const current = ++generation
    setIsKimi(false)
    if (!id) return
    try {
      await ctx.data.session.sync(id)
      if (current !== generation) return
      const providerID = ctx.data.session.get(id)?.model?.providerID
      setIsKimi(!!providerID && KIMI_PROVIDER_IDS.has(providerID))
    } catch {
      if (current === generation) setIsKimi(false)
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
    <Show when={isKimi()}>
      <box flexDirection="row" flexShrink={1} minWidth={0}>
        <text fg={statusColors<RGBA>(ctx.theme).muted} flexShrink={0}>
          Kimi{" "}
        </text>
        <Show
          when={props.usage()}
          fallback={
            <text fg={statusColors<RGBA>(ctx.theme).muted} flexShrink={0}>
              —
            </text>
          }
        >
          {(u) => (
            <box flexDirection="row" flexShrink={1} minWidth={0}>
              <Segment label={props.labels.rolling} win={u().rolling} detailed={detailed()} />
              <Separator />
              <Segment label={props.labels.weekly} win={u().weekly} detailed={detailed()} />
            </box>
          )}
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode-kimi-code-statusline.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc)
    const [usage, setUsage] = createSignal<Usage>()
    const [serverLanguage, setServerLanguage] = createSignal<unknown>()
    const labels = () => LABELS[resolveLanguage(context.options.language, serverLanguage())]
    let timer: ReturnType<typeof setInterval> | undefined

    async function refresh() {
      try {
        const result = (await rpc.get({})) as { usage?: Usage; language?: string }
        if (result?.usage) setUsage(result.usage)
        if (typeof result?.language === "string") setServerLanguage(result.language)
      } catch {
        // keep the last known usage; retry on the next interval
      }
    }

    void refresh()
    timer = setInterval(() => void refresh(), INTERVAL_MS)

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <KimiUsage
          sessionID={() => input.sessionID}
          showDetails={() => input.showDetails}
          usage={usage}
          labels={labels()}
        />
      ),
    })

    return () => {
      if (timer) clearInterval(timer)
      unregister()
    }
  },
})
