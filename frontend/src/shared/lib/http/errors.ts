import axios from 'axios';

/** Error body shape returned by the Django endpoints. */
export interface ApiErrorPayload {
  message?: string;
  log_output?: string;
}

export interface ApiError {
  /** Human-readable message, always populated (falls back to the given default). */
  message: string;
  /** Server-side execution log, when the endpoint returned one. */
  logOutput?: string;
}

/**
 * Normalise anything thrown by an API call into a predictable shape.
 *
 * Replaces the hand-rolled `typeof d === 'object' && d !== null && 'message' in d`
 * narrowing that was duplicated across every import page.
 */
export function extractApiError(error: unknown, fallback: string): ApiError {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const data = error.response?.data;
    return {
      message: data?.message ?? error.message ?? fallback,
      logOutput: data?.log_output,
    };
  }

  if (error instanceof Error) {
    return { message: error.message || fallback };
  }

  return { message: fallback };
}

/** Convenience wrapper when only the message is needed. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  return extractApiError(error, fallback).message;
}
