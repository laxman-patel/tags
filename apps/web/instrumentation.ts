export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWorld } = await import("workflow/runtime");
    await getWorld().start?.();
  }
}
