export const config = {
  maxDuration: 10,
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DAILY_LIMIT_PER_OPERATOR = 25;

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  response.setHeader("Cache-Control", "no-store");

  const configured = Boolean(process.env.GEMINI_API_KEY);
  return response.status(200).json({
    configured,
    status: configured ? "available" : "unavailable",
    provider: "gemini",
    maxImageBytes: MAX_IMAGE_BYTES,
    dailyLimitPerOperator: DAILY_LIMIT_PER_OPERATOR,
    supportedActions: configured ? ["edge-cleanup"] : [],
  });
}
