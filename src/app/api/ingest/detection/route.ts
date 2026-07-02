import { handleDetectionPost } from "@/ingest/api";

export async function POST(request: Request) {
  return handleDetectionPost(request);
}
