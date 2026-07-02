import { BUILD_SHA, buildTimeIst } from "@/lib/build-info";

export function BuildStamp() {
  return (
    <span className="tnum text-xs text-faint">
      build {BUILD_SHA} · {buildTimeIst()} IST
    </span>
  );
}
