import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPresignedUploadUrl, objectExists, validateFileSize } from "@/lib/s3";

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

  const safePath = String(path).replace(/^\/+/, "").replace(/\/+$/, "");
  const safeFileName = String(fileName).split("/").pop()?.trim() || "file";
  const baseKey = safePath ? `${safePath}/${safeFileName}` : safeFileName;

  // Без таймстампов в имени: если занято — добавляем " (2)", " (3)", ...
  const dot = safeFileName.lastIndexOf(".");
  const name = dot > 0 ? safeFileName.slice(0, dot) : safeFileName;
  const ext = dot > 0 ? safeFileName.slice(dot) : "";

  let key = baseKey;
  if (await objectExists(key)) {
    for (let n = 2; n <= 99; n++) {
      const candidateName = `${name} (${n})${ext}`;
      const candidateKey = safePath ? `${safePath}/${candidateName}` : candidateName;
      if (!(await objectExists(candidateKey))) {
        key = candidateKey;
        break;
      }
    }
  }

  const url = await getPresignedUploadUrl(key, contentType);

  return NextResponse.json({ url, key });
}
