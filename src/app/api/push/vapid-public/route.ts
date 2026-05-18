import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-send";
import { isInvalidAppleVapidSubject, resolveVapidSubject } from "@/lib/push-vapid";

export async function GET() {
  const publicKey = getVapidPublicKey();
  const subject = resolveVapidSubject();
  if (!publicKey) {
    return NextResponse.json({ configured: false, publicKey: null, appleReady: false }, { status: 200 });
  }
  return NextResponse.json({
    configured: true,
    publicKey,
    appleReady: Boolean(subject && !isInvalidAppleVapidSubject(subject)),
  });
}
