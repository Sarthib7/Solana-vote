import { NextResponse } from "next/server";

export const dynamic = "force-static";

function noContentResponse() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export function GET() {
  return noContentResponse();
}

export function HEAD() {
  return noContentResponse();
}
