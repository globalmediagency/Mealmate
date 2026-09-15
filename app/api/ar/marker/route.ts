import { handleRouteError } from "@/lib/api/respond";
import { markerPdf } from "@/lib/ar/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/ar/marker → the printable A4 PDF with the AR marker (same for everyone, no personal data). */
export async function GET() {
  try {
    const bytes = await markerPdf();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="mealmate-marqueur.pdf"',
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
