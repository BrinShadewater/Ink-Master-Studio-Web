import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

const GEMINI_MODEL = "gemini-2.5-flash-image";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DAILY_LIMIT_PER_OPERATOR = 25;
const quotaByOperator = new Map<string, { day: string; count: number }>();
const SUPPORTED_ACTIONS = ["edge-cleanup"] as const;
type AiCleanupAction = typeof SUPPORTED_ACTIONS[number];

const ACTION_PROMPTS: Record<AiCleanupAction, string> = {
  "edge-cleanup": "Production edge cleanup: remove leftover background haze and edge halos, preserve the main artwork exactly, keep transparent PNG alpha, do not add text, borders, mockups, shadows, or new design elements.",
};

const isValidMimeType = (mimeType: unknown) =>
  typeof mimeType === "string" && /^image\/(png|jpe?g|webp)$/i.test(mimeType);

const getApproximateBytes = (base64: string) => Math.ceil((base64.length * 3) / 4);
const getHeader = (request: any, name: string) => {
  const value = request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};
const getOperatorKey = (request: any) => {
  const forwardedFor = getHeader(request, "x-forwarded-for");
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown-operator";
};

export const getAiCleanupPrompt = (action: unknown) =>
  typeof action === "string" && SUPPORTED_ACTIONS.includes(action as AiCleanupAction)
    ? ACTION_PROMPTS[action as AiCleanupAction]
    : null;

export const isAllowedOrigin = (request: any) => {
  const origin = getHeader(request, "origin");
  if (typeof origin !== "string" || !origin.trim()) return true;

  const host = getHeader(request, "host");
  const allowedOrigins = (process.env.AI_CLEANUP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowedOrigins.includes(origin)) return true;
  if (typeof host !== "string" || !host.trim()) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const consumeInMemoryQuota = (operatorKey: string) => {
  const day = new Date().toISOString().slice(0, 10);
  const current = quotaByOperator.get(operatorKey);
  const next = current?.day === day
    ? { day, count: current.count + 1 }
    : { day, count: 1 };
  quotaByOperator.set(operatorKey, next);
  return next.count <= DAILY_LIMIT_PER_OPERATOR;
};

const consumeDurableQuota = async (operatorKey: string): Promise<boolean | null> => {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const day = new Date().toISOString().slice(0, 10);
  const quotaKey = `inkmaster:ai-cleanup:${day}:${operatorKey}`;
  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", quotaKey],
      ["EXPIRE", quotaKey, 60 * 60 * 36, "NX"],
    ]),
  });

  if (!response.ok) {
    throw new Error("Durable quota store unavailable.");
  }

  const results = await response.json();
  const count = Number(results?.[0]?.result);
  if (!Number.isFinite(count)) {
    throw new Error("Durable quota store returned an invalid response.");
  }
  return count <= DAILY_LIMIT_PER_OPERATOR;
};

const consumeQuota = async (operatorKey: string) => {
  const durableResult = await consumeDurableQuota(operatorKey);
  return durableResult ?? consumeInMemoryQuota(operatorKey);
};

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!isAllowedOrigin(request)) {
    return response.status(403).json({ error: "AI cleanup is only available from this Ink Master deployment." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: "AI service is not configured." });
  }

  const { base64Image, action, mimeType } = request.body ?? {};
  const prompt = getAiCleanupPrompt(action);
  if (
    typeof base64Image !== "string" ||
    prompt === null ||
    !isValidMimeType(mimeType) ||
    getApproximateBytes(base64Image) > MAX_IMAGE_BYTES
  ) {
    return response.status(400).json({ error: "Invalid image request." });
  }

  try {
    if (!await consumeQuota(getOperatorKey(request))) {
      return response.status(429).json({ error: "Daily AI cleanup limit reached." });
    }
  } catch {
    return response.status(503).json({ error: "AI cleanup quota could not be verified." });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const geminiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            text: `Act as a professional graphic designer for Print-on-Demand (POD) apparel.
Task: Apply this approved Ink Master cleanup action to the provided image: "${prompt}".

Strict Guidelines:
1. Return ONLY the image.
2. Maintain the main subject matter unless asked to remove it.
3. Ensure high contrast suitable for printing on black t-shirts if applicable.
4. Do NOT add borders or frames.
5. REQUIRED: If the user asks to remove background, the output MUST be a PNG with a transparent background (Alpha channel).`,
          },
          {
            inlineData: {
              data: base64Image,
              mimeType,
            },
          },
        ],
      },
    });

    const parts = geminiResponse.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return response.status(200).json({ image: part.inlineData.data });
      }
    }

    return response.status(502).json({ error: "AI service did not return an image." });
  } catch {
    return response.status(502).json({ error: "AI service error." });
  }
}
