import { z } from "zod";
import {
  evaluateAnswer,
  generateQuestions,
} from "@/lib/bedrock";
import {
  checkRateLimit,
  errorResponse,
  readJson,
  requestKey,
} from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const sourceSchema = z.object({
  path: z.string().min(1).max(300),
  content: z.string().max(12_000),
});

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("questions"),
    files: z.array(sourceSchema).min(1).max(6),
  }),
  z.object({
    mode: z.literal("evaluate"),
    file: sourceSchema,
    question: z.string().min(15).max(700),
    answer: z.string().trim().min(10).max(4000),
    from: z.number().int().positive(),
    to: z.number().int().positive(),
  }),
]);

export async function POST(request: Request) {
  try {
    checkRateLimit(requestKey(request, "practice"), 10);

    const parsed = requestSchema.safeParse(await readJson(request));

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid interview practice request." },
        { status: 400 },
      );
    }

    if (parsed.data.mode === "questions") {
      const questions = await generateQuestions(parsed.data.files);

      return Response.json(
        { questions },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { file, question, answer, from, to } = parsed.data;
    const lineCount = file.content.split("\n").length;

    if (to < from || to > lineCount || to - from > 25) {
      return Response.json(
        { error: "Invalid source-code line reference." },
        { status: 400 },
      );
    }

    const feedback = await evaluateAnswer({
      file,
      question,
      answer,
      from,
      to,
    });

    return Response.json(
      { feedback },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
