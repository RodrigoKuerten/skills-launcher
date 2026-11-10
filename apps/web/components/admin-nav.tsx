"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, FolderTree, Inbox, LayoutDashboard, Link2, Rss, ScrollText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/sources", label: "Sources", icon: Link2 },
  { href: "/admin/review", label: "Review queue", icon: ShieldCheck },
  { href: "/admin/reports", label: "Reports", icon: AlertTriangle },
  { href: "/admin/runs", label: "Sync runs", icon: Activity },
  { href: "/admin/discoveries", label: "Discoveries", icon: Rss },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Admin">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors",
              active ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
      <div className="pt-3">
        <Link
          href="/explore"
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Inbox className="size-3.5" /> Public catalog
        </Link>
      </div>
    </nav>
  );
}
