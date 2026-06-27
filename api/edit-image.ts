import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

const GEMINI_MODEL = "gemini-2.5-flash-image";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DAILY_LIMIT_PER_OPERATOR = 25;
const quotaByOperator = new Map<string, { day: string; count: number }>();

const isValidMimeType = (mimeType: unknown) =>
  typeof mimeType === "string" && /^image\/(png|jpe?g|webp)$/i.test(mimeType);

const getApproximateBytes = (base64: string) => Math.ceil((base64.length * 3) / 4);
const getOperatorKey = (request: any) => {
  const forwardedFor = request.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown-operator";
};
const consumeQuota = (operatorKey: string) => {
  const day = new Date().toISOString().slice(0, 10);
  const current = quotaByOperator.get(operatorKey);
  const next = current?.day === day
    ? { day, count: current.count + 1 }
    : { day, count: 1 };
  quotaByOperator.set(operatorKey, next);
  return next.count <= DAILY_LIMIT_PER_OPERATOR;
};

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(500).json({ error: "AI service is not configured." });
  }

  const { base64Image, prompt, mimeType } = request.body ?? {};
  if (
    typeof base64Image !== "string" ||
    typeof prompt !== "string" ||
    prompt.length > 500 ||
    !isValidMimeType(mimeType) ||
    getApproximateBytes(base64Image) > MAX_IMAGE_BYTES
  ) {
    return response.status(400).json({ error: "Invalid image request." });
  }

  if (!consumeQuota(getOperatorKey(request))) {
    return response.status(429).json({ error: "Daily AI cleanup limit reached." });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const geminiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: {
        parts: [
          {
            text: `Act as a professional graphic designer for Print-on-Demand (POD) apparel.
Task: Edit the provided image based on the user's request: "${prompt}".

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
