"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; external?: boolean; badge?: string };

export function AdminNav({ items, label, badges = {} }: { items: NavItem[]; label: string; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="nav">
        {items.map((item) => {
          const current = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const count = item.badge ? badges[item.badge] ?? 0 : 0;
          const inner = (
            <>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {count ? <span className="badge">{count}</span> : null}
            </>
          );
          return (
            <li key={item.href}>
              {item.external ? (
                <a href={item.href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              ) : (
                <Link href={item.href} aria-current={current ? "page" : undefined}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
