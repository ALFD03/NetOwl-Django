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
 * Thrown when an analysis finishes with `status: error` in the worker.
 *
 * The HTTP call that started it succeeded, so there is no axios error to read:
 * the failure arrives in the job row, with the same message + console log pair
 * the synchronous endpoints used to return.
 */
export class JobFailedError extends Error {
  readonly logOutput?: string;

  constructor(message: string, logOutput?: string) {
    super(message);
    this.name = 'JobFailedError';
    this.logOutput = logOutput;
  }
}

/**
 * Un análisis que alguien detuvo desde la interfaz.
 *
 * No es un fallo y por eso no es un `JobFailedError`: nada salió mal, se pidió
 * parar. Quien la reciba debe contarlo como un aviso, no como un error. Lleva el
 * log igual, que es lo que dice hasta dónde llegó el cálculo.
 */
export class JobCancelledError extends Error {
  readonly logOutput?: string;

  constructor(message: string, logOutput?: string) {
    super(message);
    this.name = 'JobCancelledError';
    this.logOutput = logOutput;
  }
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

  if (error instanceof JobFailedError || error instanceof JobCancelledError) {
    return { message: error.message || fallback, logOutput: error.logOutput };
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
