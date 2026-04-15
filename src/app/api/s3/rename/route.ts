import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renameObject } from "@/lib/s3";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fromKey, toKey } = await req.json();
  if (!fromKey || typeof fromKey !== "string" || !toKey || typeof toKey !== "string") {
    return NextResponse.json({ error: "Missing fromKey/toKey" }, { status: 400 });
  }
  if (fromKey === toKey) {
    return NextResponse.json({ success: true });
  }

  await renameObject(fromKey, toKey);
  return NextResponse.json({ success: true });
}

