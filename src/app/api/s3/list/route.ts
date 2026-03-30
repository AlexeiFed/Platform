import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listObjects } from "@/lib/s3";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "CURATOR")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefix = req.nextUrl.searchParams.get("prefix") ?? undefined;
  const result = await listObjects(prefix);

  const files = (result.Contents ?? []).map((obj) => ({
    Key: obj.Key,
    Size: obj.Size,
    LastModified: obj.LastModified?.toISOString(),
  }));

  return NextResponse.json({
    files,
    hasMore: result.IsTruncated,
    nextToken: result.NextContinuationToken,
  });
}
