"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

export type NavItem = { href: string; label: string; icon: IconName };

export function AdminNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="nav">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
