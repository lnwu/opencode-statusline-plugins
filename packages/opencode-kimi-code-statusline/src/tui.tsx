/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import type { RGBA } from "@opentui/core";
import { createSignal } from "solid-js";
import { resolveLanguage, type Language } from "core/language";
import {
  createProviderGate,
  QuotaSegment,
  QuotaStatusline,
  Separator,
  startPolling,
} from "core/statusline";
import { statusColors } from "core/theme";
import { UsageRpc, type Usage } from "./rpc";

const KIMI_PROVIDER_IDS = new Set(["kimi-code-plan-global", "kimi-code-plan-cn"]);

const LABELS = {
  en: { rolling: "5h", weekly: "Weekly" },
  "zh-CN": { rolling: "5h", weekly: "周" },
} as const;

type Labels = (typeof LABELS)[Language];

function KimiUsage(props: {
  sessionID: () => string | undefined;
  showDetails: () => boolean;
  usage: () => Usage | undefined;
  labels: Labels;
}) {
  const ctx = usePlugin();
  const isKimi = createProviderGate(
    props.sessionID,
    (providerID) => !!providerID && KIMI_PROVIDER_IDS.has(providerID),
  );
  const muted = () => statusColors<RGBA>(ctx.theme).muted;

  return (
    <QuotaStatusline
      enabled={isKimi}
      title="Kimi"
      color={muted}
      usage={props.usage}
      showDetails={props.showDetails}
    >
      {(u, detailed) => (
        <>
          <QuotaSegment label={props.labels.rolling} win={u().rolling} detailed={detailed} />
          <Separator />
          <QuotaSegment label={props.labels.weekly} win={u().weekly} detailed={detailed} />
        </>
      )}
    </QuotaStatusline>
  );
}

export default Plugin.define({
  id: "opencode-kimi-code-statusline.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc);
    const [usage, setUsage] = createSignal<Usage>();
    const [serverLanguage, setServerLanguage] = createSignal<unknown>();
    const labels = () => LABELS[resolveLanguage(context.options.language, serverLanguage())];

    // A failing fetch keeps the last known usage; the next tick retries.
    const stopPolling = startPolling(async () => {
      const result = (await rpc.get({})) as { usage?: Usage; language?: string };
      if (result?.usage) setUsage(result.usage);
      if (typeof result?.language === "string") setServerLanguage(result.language);
    });

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
    });

    return () => {
      stopPolling();
      unregister();
    };
  },
});
