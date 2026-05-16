import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-send";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ configured: false, publicKey: null }, { status: 200 });
  }
  return NextResponse.json({ configured: true, publicKey });
}
