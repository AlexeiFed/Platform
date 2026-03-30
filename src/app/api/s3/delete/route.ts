import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteObject } from "@/lib/s3";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await req.json();
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  await deleteObject(key);
  return NextResponse.json({ success: true });
}
