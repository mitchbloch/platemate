import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { listRecipes } from "@/lib/recipes";
import { getHousehold } from "@/lib/household";
import { getActiveHouseholdId } from "@/lib/supabase/auth";
import {
  GenerationConflictError,
  appendTurn,
  countHouseholdTurnsSince,
  createGeneration,
  getGeneration,
  listActiveGenerations,
} from "@/lib/recipeGenerations";
import {
  GENERATION_MODEL,
  GENERATION_RESPONSE_SCHEMA,
  MAX_TURNS,
  MAX_TURNS_PER_DAY,
  buildSystemBlocks,
  countUserTurns,
  toApiMessages,
  userTurnContent,
  validateGenerateRequest,
  validateGenerationResponse,
} from "@/lib/recipeGeneration";
import type { GenerationMessage } from "@/lib/types";

// A full recipe draft with nutrition can take 10–20s
export const maxDuration = 60;

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  return (anthropicClient ??= new Anthropic());
}

/** GET — the household's in-progress chats. */
export async function GET() {
  try {
    return NextResponse.json(await listActiveGenerations());
  } catch (error) {
    console.error("[GET /api/generate]", error);
    return NextResponse.json({ error: "Couldn't load your conversations" }, { status: 500 });
  }
}

/** POST — one turn: user message (+ photos) → Claude → persisted reply. */
export async function POST(request: NextRequest) {
  try {
    const parsed = validateGenerateRequest(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { generationId, message, images } = parsed.request;

    let generation = generationId ? await getGeneration(generationId) : null;
    if (generationId && !generation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (generation?.status === "saved") return NextResponse.json({ error: "This recipe was already saved" }, { status: 409 });
    if (countUserTurns(generation?.messages ?? []) >= MAX_TURNS) {
      return NextResponse.json({ error: `This chat has reached ${MAX_TURNS} messages — save the draft or start a new one` }, { status: 409 });
    }
    // Spend ceiling: every turn is a Sonnet call; new chats don't reset it
    if ((await countHouseholdTurnsSince(24)) >= MAX_TURNS_PER_DAY) {
      return NextResponse.json({ error: "Your household has hit today's limit for recipe generation — try again tomorrow" }, { status: 429 });
    }

    const [householdId, recipes] = await Promise.all([getActiveHouseholdId(), listRecipes()]);
    const household = await getHousehold(householdId);
    if (!household) return NextResponse.json({ error: "Household not found" }, { status: 404 });

    const response = await getAnthropic().messages.create({
      model: GENERATION_MODEL,
      max_tokens: 16000,
      system: buildSystemBlocks(household, recipes),
      messages: [
        ...toApiMessages(generation?.messages ?? []),
        { role: "user", content: userTurnContent(message, images) },
      ],
      output_config: { format: { type: "json_schema", schema: GENERATION_RESPONSE_SCHEMA } },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The assistant declined that request" }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "That answer ran too long — try asking for something more specific" }, { status: 502 });
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text) throw new Error("Unexpected response format from the assistant");

    const result = validateGenerationResponse(JSON.parse(text.text), recipes);
    const now = new Date().toISOString();
    const userMessage: GenerationMessage = { role: "user", content: message, photoCount: images.length, seenIngredients: result.seenIngredients, at: now };
    const assistantMessage: GenerationMessage = { role: "assistant", reply: result.reply, options: result.options, recipe: result.recipe, libraryMatches: result.libraryMatches, at: now };

    generation ??= await createGeneration(message);
    const updated = await appendTurn(generation, { user: userMessage, assistant: assistantMessage }, result.recipe);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof GenerationConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Internal detail (Postgres, SDK) stays in the logs
    console.error("[POST /api/generate]", error);
    return NextResponse.json({ error: "The assistant couldn't answer right now — please try again" }, { status: 500 });
  }
}
