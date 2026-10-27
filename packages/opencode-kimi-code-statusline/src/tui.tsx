/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui";
import type { RGBA } from "@opentui/core";
import { createSignal } from "solid-js";
import { resolveLanguage, type Language } from "core/language";
import {
  createSessionProvider,
  QuotaSegment,
  QuotaStatusline,
  Separator,
  startPolling,
} from "core/statusline";
import { statusColors } from "core/theme";
import { UsageRpc, type Usages } from "./rpc";

const KIMI_PROVIDER_IDS = new Set<string | undefined>([
  "kimi-code-plan-global",
  "kimi-code-plan-cn",
]);

const LABELS = {
  en: {
    full: { rolling: "5h", weekly: "Weekly" },
    compact: { rolling: "5H", weekly: "W" },
  },
  "zh-CN": {
    full: { rolling: "5h", weekly: "周" },
    compact: { rolling: "5H", weekly: "周" },
  },
} as const;

type Labels = (typeof LABELS)[Language];

function KimiUsage(props: {
  sessionID: () => string | undefined;
  usages: () => Usages | undefined;
  labels: Labels;
}) {
  const ctx = usePlugin();
  const provider = createSessionProvider(props.sessionID);
  const isKimi = () => KIMI_PROVIDER_IDS.has(provider());
  // The quota of the plan the session runs on, never the other plan's.
  const usage = () => props.usages()?.[provider() as keyof Usages];
  const muted = () => statusColors<RGBA>(ctx.theme).muted;

  return (
    <QuotaStatusline enabled={isKimi} title="Kimi" color={muted} usage={usage}>
      {(u, density) =>
        density === "minimal" ? (
          <QuotaSegment label={props.labels.compact.weekly} win={u().weekly} detailed={false} />
        ) : (
          <>
            <QuotaSegment
              label={props.labels[density].rolling}
              win={u().rolling}
              detailed={density === "full"}
            />
            <Separator />
            <QuotaSegment
              label={props.labels[density].weekly}
              win={u().weekly}
              detailed={density === "full"}
            />
          </>
        )
      }
    </QuotaStatusline>
  );
}

export default Plugin.define({
  id: "opencode-kimi-code-statusline.tui",
  setup(context) {
    const rpc = context.client.rpc(UsageRpc);
    const [usages, setUsages] = createSignal<Usages>();
    const [serverLanguage, setServerLanguage] = createSignal<unknown>();
    const labels = () => LABELS[resolveLanguage(context.options.language, serverLanguage())];

    // A failing fetch keeps the last known usage; the next tick retries.
    const stopPolling = startPolling(async () => {
      const result = (await rpc.get({})) as { usages?: Usages; language?: string };
      if (result?.usages) setUsages(result.usages);
      if (typeof result?.language === "string") setServerLanguage(result.language);
    });

    const unregister = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <KimiUsage sessionID={() => input.sessionID} usages={usages} labels={labels()} />
      ),
    });

    return () => {
      stopPolling();
      unregister();
    };
  },
});
