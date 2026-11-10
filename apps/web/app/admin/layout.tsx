import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="container-page grid gap-8 py-8 lg:grid-cols-[210px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent-soft/40 p-2.5">
          <ShieldCheck className="size-4 text-accent" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Admin</p>
            <p className="font-mono text-[9px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <AdminNav />
        <p className="mt-6 px-2 text-[9px] leading-relaxed text-muted-foreground">
          Admin mutations and publishing are audit-logged. Publishing moves the public pointer; quarantine blocks downloads.
        </p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
