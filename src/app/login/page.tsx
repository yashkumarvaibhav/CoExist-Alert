import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in · CoExist Alert" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  // Only allow same-site relative redirects (open-redirect guard).
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : null;

  return (
    <main className="min-h-screen bg-page">
      <header className="border-b border-line px-4 py-3">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image src="/coexist-icon.png" alt="" width={28} height={28} />
          <span className="font-serif text-lg text-ink">CoExist Alert</span>
        </Link>
      </header>
      <LoginForm next={next} />
    </main>
  );
}
