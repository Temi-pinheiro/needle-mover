import { NextResponse } from "next/server";
import { authClient } from "@/lib/supabase/server";
import { appPath } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(
    appPath("/login"),
    { status: 303 },
  );
}
