import { NextResponse } from "next/server";

import { getRuntimeRepositories } from "@/db/runtime";
import { ingestErrorResponse, parseRequestBody } from "@/ingest/http";
import { scenarioRequestSchema } from "@/sim/demo-request";
import { SimulatorError } from "@/sim/errors";
import { resetWorldEvents } from "@/sim/reset";
import { getOrCreateSimulator } from "@/sim/runtime";
import { publishStreamEvents } from "@/stream/hub";

function requireNodeId(nodeId: string | undefined): string {
  if (nodeId === undefined) {
    throw new SimulatorError(400, "node_id_required", "This action needs a nodeId.");
  }
  return nodeId;
}

export async function POST(request: Request) {
  try {
    const payload = await parseRequestBody(request, scenarioRequestSchema);
    const simulator = getOrCreateSimulator();

    switch (payload.action) {
      case "trigger_detection": {
        if (payload.preset === undefined) {
          throw new SimulatorError(
            400,
            "preset_required",
            "trigger_detection needs a scenario preset.",
          );
        }
        const scheduled = simulator.runScenario(payload.preset, payload.nodeId);
        return NextResponse.json({ ok: true, scheduled, state: simulator.status() });
      }
      case "second_signal": {
        const sent = await simulator.sendSecondSignal(payload.nodeId);
        return NextResponse.json({ ok: true, sent, state: simulator.status() });
      }
      case "kill_link": {
        simulator.killLink(requireNodeId(payload.nodeId));
        return NextResponse.json({ ok: true, state: simulator.status() });
      }
      case "restore_link": {
        simulator.restoreLink(requireNodeId(payload.nodeId));
        return NextResponse.json({ ok: true, state: simulator.status() });
      }
      case "set_ambient": {
        if (payload.enabled === undefined) {
          throw new SimulatorError(
            400,
            "enabled_required",
            "set_ambient needs an enabled flag.",
          );
        }
        simulator.setAmbient(payload.enabled);
        return NextResponse.json({ ok: true, state: simulator.status() });
      }
      case "reset": {
        simulator.reset();
        return NextResponse.json({ ok: true, state: simulator.status() });
      }
      case "reset_world": {
        simulator.reset();
        const outcome = resetWorldEvents(getRuntimeRepositories());
        publishStreamEvents(outcome.streamEvents);
        return NextResponse.json({
          ok: true,
          settled: outcome.settled,
          state: simulator.status(),
        });
      }
    }
  } catch (error) {
    if (error instanceof SimulatorError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return ingestErrorResponse(error);
  }
}
