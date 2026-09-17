/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { UsageRpc, type Usage, type UsageWindow } from "./rpc"

const INTERVAL_MS = 60000
const DETAILED_WIDTH = 125
const GO_PROVIDER_ID = "opencode-go"

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
    const t = ctx.theme
    if (props.win.status && props.win.status !== "ok") return t.text.feedback.error.default
    if (props.win.percent >= 90) return t.text.feedback.error.default
    if (props.win.percent >= 70) return t.text.feedback.info.default
    return t.text.subdued
  }
  const text = () => {
    const left = props.detailed ? countdown(props.win.resetsAt, Date.now()) : undefined
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
    <text fg={ctx.theme.text.subdued} flexShrink={0}>
      {" · "}
    </text>
  )
}

function GoUsage(props: {
  sessionID: () => string | undefined
  showDetails: () => boolean
  usage: () => Usage | undefined
}) {
  const ctx = usePlugin()
  const [isGo, setIsGo] = createSignal(false)
  const dims = useTerminalDimensions()
  const detailed = () => props.showDetails() || dims().width >= DETAILED_WIDTH

  let generation = 0
  async function check(id: string | undefined) {
    const current = ++generation
    setIsGo(false)
    if (!id) return
    try {
      await ctx.data.session.sync(id)
      if (current !== generation) return
      setIsGo(ctx.data.session.get(id)?.model?.providerID === GO_PROVIDER_ID)
    } catch {
      if (current === generation) setIsGo(false)
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
    <Show when={isGo()}>
      <box flexDirection="row" flexShrink={1} minWidth={0}>
        <text fg={ctx.theme.text.subdued} flexShrink={0}>
          Go{" "}
        </text>
        <Show
          when={props.usage()}
          fallback={
            <text fg={ctx.theme.text.subdued} flexShrink={0}>
              —
            </text>
          }
        >
          {(u) => (
            <box flexDirection="row" flexShrink={1} minWidth={0}>
              <Segment label="5h" win={u().rolling} detailed={detailed()} />
              <Separator />
              <Segment label="周" win={u().weekly} detailed={detailed()} />
              <Separator />
              <Segment label="月" win={u().monthly} detailed={detailed()} />
            </box>
          )}
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "lnwu.go-usage.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc)
    const [usage, setUsage] = createSignal<Usage>()
    let timer: ReturnType<typeof setInterval> | undefined

    async function refresh() {
      try {
        const result = (await rpc.get({})) as { usage?: Usage }
        if (result?.usage) setUsage(result.usage)
      } catch {
        // keep the last known usage; retry on the next interval
      }
    }

    void refresh()
    timer = setInterval(() => void refresh(), INTERVAL_MS)

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <GoUsage
          sessionID={() => input.sessionID}
          showDetails={() => input.showDetails}
          usage={usage}
        />
      ),
    })

    return () => {
      if (timer) clearInterval(timer)
      unregister()
    }
  },
})
