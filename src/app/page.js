"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/app/lib/authClient";
import { ROLE_HOME } from "@/app/lib/roleRoutes";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const u = getSession();
    if (!u) router.replace("/auth/login");
    else router.replace(ROLE_HOME[u.role] || "/auth/login");
  }, [router]);

  return null; // or show a small "Loading..." text
}
