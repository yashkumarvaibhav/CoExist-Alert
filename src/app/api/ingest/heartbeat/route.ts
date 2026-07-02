import { handleHeartbeatPost } from "@/ingest/api";

export async function POST(request: Request) {
  return handleHeartbeatPost(request);
}
