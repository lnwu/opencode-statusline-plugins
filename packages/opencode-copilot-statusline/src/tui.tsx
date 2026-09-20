/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import type { RGBA } from "@opentui/core";
import { createSignal } from "solid-js";
import {
  countdown,
  createProviderGate,
  quotaColor,
  QuotaStatusline,
  startPolling,
} from "core/statusline";
import { statusColors } from "core/theme";
import { UsageRpc, type Usage } from "./rpc";

const COPILOT_PROVIDER_ID = "github-copilot";

function Segment(props: { usage: Usage; color: () => RGBA | undefined; detailed: boolean }) {
  const text = () => {
    if (props.usage.unlimited) return "∞";
    const left = props.detailed ? countdown(props.usage.resetsAt, Date.now()) : undefined;
    return `${props.usage.usedPercent}%${left ? ` (${left})` : ""}`;
  };
  return (
    <text fg={props.color()} wrapMode="none" flexShrink={1}>
      {text()}
    </text>
  );
}

function CopilotUsage(props: {
  sessionID: () => string | undefined;
  showDetails: () => boolean;
  usage: () => Usage | undefined;
  loaded: () => boolean;
}) {
  const ctx = usePlugin();
  const isCopilot = createProviderGate(
    props.sessionID,
    (providerID) => providerID === COPILOT_PROVIDER_ID,
  );

  // One color for the whole segment, so the label follows the percentage.
  // `loaded` separates "first fetch still running" (subdued) from "no data"
  // (error): an unresolvable credential or a failing API is a failure, not a
  // loading state.
  const fg = () => {
    const colors = statusColors<RGBA>(ctx.theme);
    const u = props.usage();
    if (!u) return props.loaded() ? colors.error : colors.muted;
    if (u.unlimited) return colors.muted;
    return quotaColor(ctx.theme, u.usedPercent);
  };

  return (
    <QuotaStatusline
      enabled={isCopilot}
      title="Copilot"
      color={fg}
      usage={props.usage}
      showDetails={props.showDetails}
    >
      {(u, detailed) => <Segment usage={u()} color={fg} detailed={detailed} />}
    </QuotaStatusline>
  );
}

export default Plugin.define({
  id: "opencode-copilot-statusline.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc);
    const [usage, setUsage] = createSignal<Usage>();
    const [loaded, setLoaded] = createSignal(false);

    // A failing fetch keeps the last known usage; the next tick retries.
    const stopPolling = startPolling(async () => {
      try {
        const result = (await rpc.get({})) as { usage?: Usage };
        if (result?.usage) setUsage(result.usage);
      } finally {
        setLoaded(true);
      }
    });

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
    });

    return () => {
      stopPolling();
      unregister();
    };
  },
});
