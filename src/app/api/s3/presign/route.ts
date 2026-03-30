import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPresignedUploadUrl, validateFileSize } from "@/lib/s3";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileName, contentType, size, path } = await req.json();

  if (!fileName || !contentType || !size || !path) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (!validateFileSize(size, contentType)) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const key = `${path}/${Date.now()}-${fileName}`;
  const url = await getPresignedUploadUrl(key, contentType);

  return NextResponse.json({ url, key });
}
