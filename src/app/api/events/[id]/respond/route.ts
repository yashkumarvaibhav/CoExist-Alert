import { handleEventResponsePost } from "@/responses/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return handleEventResponsePost(request, id);
}
