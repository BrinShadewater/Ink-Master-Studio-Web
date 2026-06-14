export const editImageWithGemini = async (
  base64Image: string,
  prompt: string,
  mimeType: string
): Promise<string | null> => {
  const response = await fetch('/api/edit-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Image, prompt, mimeType }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? 'AI service request failed.');
  }

  const data = await response.json();
  return typeof data.image === 'string' ? data.image : null;
};
