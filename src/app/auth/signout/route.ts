import { NextResponse } from "next/server";
import { authClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
    { status: 303 },
  );
}
