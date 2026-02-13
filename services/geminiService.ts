import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from '../constants';

export const editImageWithGemini = async (
  base64Image: string,
  prompt: string,
  mimeType: string
): Promise<string | null> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
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
            5. REQUIRED: If the user asks to remove background, the output MUST be a PNG with a transparent background (Alpha channel).
            `
          },
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
        ],
      },
    });

    // Extract image from response
    // The Gemini 2.5 Flash Image model might return text, image, or both.
    // We iterate to find the image part.
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
      }
    }
    
    return null;

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};