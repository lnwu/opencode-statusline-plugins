// Footer unit-test helper: render a package's built `dist/tui.js` in the
// OpenTUI test renderer with a mocked plugin context and capture the footer
// frame — no OpenCode, no tmux, no network.
//
// Tests must run with `bun test --conditions=browser`. Bun's default
// resolution selects solid-js's server build, where `createEffect` never runs
// and signals do not propagate, so the statusline would stay in its initial
// state and `waitForText` would hang. The browser condition selects the
// reactive build; `assertReactiveSolid` turns a missing flag into a clear
// error.
//
// The built entry must be tested, not `src/`: `src` imports `core/*.tsx`
// through the node_modules symlink, where OpenTUI's Solid transform is skipped
// (the limitation that makes the published entries pre-compiled).
import { PluginContextProvider, type Plugin } from "@opencode/plugin/tui";
import { testRender } from "@opentui/solid";
import { createComponent, createComputed, createSignal, type JSX } from "solid-js";

/** The `prompt.footer.status` render input the helper feeds the slot claim. */
type PromptFooterInput = { sessionID?: string; mode: "normal" | "shell"; showDetails: boolean };

/** The registered slot claim, narrowed to what the helper renders. */
type FooterClaim = { render: (input: PromptFooterInput) => JSX.Element };

export interface FooterTestOptions {
  /** Absolute path to the package's built `dist/tui.js`. */
  tuiEntry: string;
  /**
   * Resolved value of the usage RPC's `get`. Omitted (or `{}`) renders the
   * "no data" fallback.
   */
  rpcResult?: unknown;
  /** Model provider of the session; anything else hides the statusline. */
  providerID?: string;
  /** Plugin options, e.g. `{ language: "zh-CN" }`. */
  options?: Readonly<Record<string, unknown>>;
  /** Renderer width; defaults to 80, below the 125-column countdown threshold. */
  width?: number;
  height?: number;
  sessionID?: string;
  /** Expands the footer details, forcing the reset countdowns on. */
  showDetails?: boolean;
}

export interface FooterTest {
  /** Waits for a frame containing `text` and returns that frame. */
  waitForText(text: string): Promise<string>;
  /** Renders one frame and returns it (for asserting absence). */
  renderOnce(): Promise<string>;
  /** Stops polling and destroys the renderer. */
  dispose(): Promise<void>;
}

export async function setupFooterTest(options: FooterTestOptions): Promise<FooterTest> {
  assertReactiveSolid();

  const tui = (await import(options.tuiEntry)) as {
    default: { setup(context: Plugin.Context): unknown };
  };

  let claim: FooterClaim | undefined;
  const context = {
    options: options.options ?? {},
    location: undefined,
    theme: {},
    client: {
      // The fake ignores the RPC definition and always answers with the
      // caller's canned result.
      rpc: () => ({ get: async () => options.rpcResult ?? {} }),
    },
    ui: {
      slot: (candidate: FooterClaim) => {
        claim = candidate;
        return () => {};
      },
    },
    data: {
      session: {
        sync: async () => {},
        get: () => ({ model: { providerID: options.providerID } }),
      },
      on: () => () => {},
    },
  } as unknown as Plugin.Context;

  const cleanup = (await tui.default.setup(context)) as (() => void) | undefined;
  if (!claim) throw new Error("the plugin registered no prompt.footer.status slot");
  const render = claim.render;

  const input: PromptFooterInput = {
    sessionID: options.sessionID ?? "footer-test",
    mode: "normal",
    showDetails: options.showDetails ?? false,
  };
  const renderer = await testRender(
    () =>
      createComponent(PluginContextProvider, {
        value: context,
        get children() {
          return render(input);
        },
      }),
    { width: options.width ?? 80, height: options.height ?? 10 },
  );

  return {
    waitForText: (text) => renderer.waitForFrame((frame) => frame.includes(text)),
    async renderOnce() {
      await renderer.renderOnce();
      return renderer.captureCharFrame();
    },
    async dispose() {
      cleanup?.();
      renderer.renderer.destroy();
    },
  };
}

/**
 * Guard against running without `--conditions=browser`: the server build runs
 * each computation exactly once, so a second `createComputed` run only happens
 * with the reactive build.
 */
function assertReactiveSolid(): void {
  const [value, setValue] = createSignal(0);
  let runs = 0;
  createComputed(() => {
    value();
    runs += 1;
  });
  setValue(1);
  if (runs < 2) {
    throw new Error("solid-js resolved to its server build; run `bun test --conditions=browser`");
  }
}
