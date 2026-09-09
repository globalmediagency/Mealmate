import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isConfigError } from "@/lib/env";

export type ApiErrorBody = { error: { code: string; message: string } };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function fail(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Maps any thrown error to the normalised `{ error: { code, message } }` shape. */
export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (isConfigError(error)) {
    return fail("config_missing", error.message, 503);
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(
      "validation_error",
      first ? `${first.path.join(".") || "champ"} : ${first.message}` : "Données invalides.",
      400,
    );
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const err = error as { code: unknown; message?: string; status?: number };
    if (typeof err.code === "string" && typeof err.status === "number") {
      return fail(err.code, err.message ?? "Erreur.", err.status);
    }
  }
  console.error("[api] unhandled error", error);
  return fail("internal_error", "Une erreur inattendue est survenue.", 500);
}
