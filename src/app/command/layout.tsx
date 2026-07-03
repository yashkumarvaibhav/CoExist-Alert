import { CommandShell } from "@/components/command/command-shell";
import { getRuntimeRepositories } from "@/db/runtime";

// Live console — every command route reads current field state per request.
export const dynamic = "force-dynamic";

export default function CommandLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nodes = getRuntimeRepositories()
    .nodes.list()
    .map(({ id, name, kind }) => ({ id, name, kind }));

  return <CommandShell nodes={nodes}>{children}</CommandShell>;
}
