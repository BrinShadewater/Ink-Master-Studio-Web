import { AiCleanupStatus } from '../types';

const unavailableStatus: AiCleanupStatus = {
  availability: 'unavailable',
  message: 'AI cleanup is not configured on this server.',
  maxImageBytes: null,
  dailyLimitPerOperator: null,
  supportedActions: [],
};

export const getAiCleanupStatus = async (): Promise<AiCleanupStatus> => {
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return {
      ...unavailableStatus,
      message: 'AI cleanup is available after deployment or when running with server API routes.',
    };
  }

  try {
    const response = await fetch('/api/ai-cleanup-status', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      return {
        ...unavailableStatus,
        availability: 'error',
        message: 'AI cleanup status could not be checked.',
      };
    }
    const data = await response.json();
    const configured = data?.configured === true && data?.status === 'available';
    return {
      availability: configured ? 'available' : 'unavailable',
      message: configured
        ? 'AI cleanup is available for edge repair and background haze removal.'
        : 'AI cleanup is not configured on this server.',
      maxImageBytes: typeof data?.maxImageBytes === 'number' ? data.maxImageBytes : null,
      dailyLimitPerOperator: typeof data?.dailyLimitPerOperator === 'number' ? data.dailyLimitPerOperator : null,
      supportedActions: Array.isArray(data?.supportedActions)
        ? data.supportedActions.filter((entry: unknown): entry is string => typeof entry === 'string')
        : [],
    };
  } catch {
    return {
      ...unavailableStatus,
      availability: 'error',
      message: 'AI cleanup status could not be checked.',
    };
  }
};

export const editImageWithGemini = async (
  base64Image: string,
  mimeType: string,
  action = 'edge-cleanup',
): Promise<string | null> => {
  const response = await fetch('/api/edit-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Image, action, mimeType }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? 'AI service request failed.');
  }

  const data = await response.json();
  return typeof data.image === 'string' ? data.image : null;
};
