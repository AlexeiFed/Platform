import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { s3Client } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET!;
const ENDPOINT = process.env.S3_ENDPOINT ?? "https://storage.yandexcloud.net";

function extractKeyFromSource(src: string): string | null {
  // Accept:
  // 1) raw key: "documents/file.pdf"
  // 2) public url: https://{bucket}.storage.yandexcloud.net/{key}
  // 3) path-style url: https://storage.yandexcloud.net/{bucket}/{key}
  try {
    if (!src) return null;
    if (!src.startsWith("http://") && !src.startsWith("https://")) {
      return src.replace(/^\/+/, "");
    }

    const u = new URL(src);

    // virtual-hosted style
    if (u.hostname === `${BUCKET}.storage.yandexcloud.net`) {
      return u.pathname.replace(/^\/+/, "");
    }

    // path-style (endpoint/bucket/key)
    const endpointHost = new URL(ENDPOINT).hostname;
    if (u.hostname === endpointHost) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== BUCKET) return null;
      return parts.slice(1).join("/");
    }

    return null;
  } catch {
    return null;
  }
}

async function streamToUint8Array(stream: any): Promise<Uint8Array> {
  // AWS SDK v3 Body in Node: ReadableStream / AsyncIterable / Buffer
  if (!stream) return new Uint8Array();
  if (stream instanceof Uint8Array) return stream;
  if (Buffer.isBuffer(stream)) return new Uint8Array(stream);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
    if (typeof chunk === "string") {
      chunks.push(new TextEncoder().encode(chunk));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(new Uint8Array(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  const size = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const src = req.nextUrl.searchParams.get("src") ?? "";
  const key = extractKeyFromSource(src);
  if (!key) return NextResponse.json({ error: "Bad src" }, { status: 400 });

  // Range support for pdf.js (mobile + large PDFs)
  const range = req.headers.get("range") ?? undefined;

  try {
    const cmd = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ...(range ? { Range: range } : {}),
    });
    const res = await s3Client.send(cmd);

    const bodyBytes = await streamToUint8Array(res.Body);

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");

    if (res.ContentLength != null && !range) {
      headers.set("Content-Length", String(res.ContentLength));
    }

    // If ranged response, forward headers
    const contentRange = (res as any).ContentRange as string | undefined;
    if (contentRange) headers.set("Content-Range", contentRange);
    if (res.ContentLength != null && range) headers.set("Content-Length", String(res.ContentLength));

    return new NextResponse(bodyBytes, {
      status: contentRange ? 206 : 200,
      headers,
    });
  } catch (e) {
    console.error("[api/pdf]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

