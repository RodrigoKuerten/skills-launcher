import type { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";
import { publishVersion, rejectVersion } from "@/lib/publish";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const result = await publishVersion(id, admin.id);
    return json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    await rejectVersion(id, admin.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
