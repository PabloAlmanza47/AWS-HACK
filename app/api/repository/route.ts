import { z } from "zod";
import { analyzeRepository, GitHubFailure } from "@/lib/github";
import {
  checkRateLimit,
  errorResponse,
  readJson,
  requestKey,
} from "@/lib/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().url().max(300),
});

export async function POST(request: Request) {
  try {
    checkRateLimit(requestKey(request, "repository"), 8);

    const input = requestSchema.safeParse(await readJson(request, 1000));

    if (!input.success) {
      return Response.json(
        { error: "Enter a valid GitHub repository URL." },
        { status: 400 },
      );
    }

    const repository = await analyzeRepository(input.data.url);

    return Response.json(repository, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof GitHubFailure) {
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return errorResponse(error);
  }
}
