// Shared subprocess helper for the dev-only core modules (integration harness,
// packaging smoke test, demo recorder).
//
// `run` captures stdout/stderr and enforces an optional timeout; `mustRun`
// throws with the command and both streams on a non-zero exit. The full
// environment is inherited, with `env` merged on top.
export type Env = Record<string, string | undefined>;
export type RunResult = { code: number; stdout: string; stderr: string };
export type RunOptions = { env?: Env; cwd?: string; timeoutMs?: number };

export async function run(cmd: string[], options: RunOptions = {}): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    env: { ...process.env, ...options.env },
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = options.timeoutMs ? setTimeout(() => proc.kill(), options.timeoutMs) : undefined;
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (timer) clearTimeout(timer);
  return { code, stdout, stderr };
}

export async function mustRun(cmd: string[], options: RunOptions = {}): Promise<RunResult> {
  const result = await run(cmd, options);
  if (result.code !== 0) {
    throw new Error(
      `${cmd.join(" ")} exited with ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}
