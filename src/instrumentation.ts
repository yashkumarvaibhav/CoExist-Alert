/**
 * Next.js server-start hook: boots the field runtime (state sweep + simulated
 * heartbeat loop) with the server, in the Node.js runtime only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startFieldRuntime } = await import("@/sim/boot");
  startFieldRuntime();
}
