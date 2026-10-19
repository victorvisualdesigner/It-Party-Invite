"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  external?: boolean;
  badge?: string;
  /** Shown in the phone's bottom bar. Everything else sits under More. */
  primary?: boolean;
  /** One word for the phone's bottom bar. */
  short?: string;
};

function isCurrent(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

/** A thin gold line under the tapped item while its page loads, so a tap never feels ignored. */
function LoadingMark() {
  const { pending } = useLinkStatus();
  return <span className={pending ? "nav-loading on" : "nav-loading"} aria-hidden="true" />;
}

function ItemLink({ item, current, count, onNavigate, short = false }: { item: NavItem; current: boolean; count: number; onNavigate?: () => void; short?: boolean }) {
  const inner = (
    <>
      <Icon name={item.icon} />
      <span className="nav-label">{short && item.short ? item.short : item.label}</span>
      {count ? <span className="badge">{count}</span> : null}
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={item.href} aria-current={current ? "page" : undefined} onClick={onNavigate}>
      {inner}
      <LoadingMark />
    </Link>
  );
}

/** The laptop sidebar list. It never scrolls: the sidebar is sized to fit every item. */
export function AdminNav({ items, label, badges = {} }: { items: NavItem[]; label: string; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="nav">
        {items.map((item) => (
          <li key={item.href}>
            <ItemLink item={item} current={isCurrent(item, pathname)} count={item.badge ? badges[item.badge] ?? 0 : 0} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Phones: a bottom tab bar with the four places the host goes most, and More for the rest.
 * Thumbs reach the bottom of the screen; a scrolling row of tiny icons at the top they don't.
 */
export function PhoneTabs({
  items,
  label,
  moreLabel,
  closeLabel,
  allLabel,
  badges = {},
  footer,
}: {
  items: NavItem[];
  label: string;
  moreLabel: string;
  closeLabel: string;
  allLabel: string;
  badges?: Record<string, number>;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const primary = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  const inMore = rest.some((i) => isCurrent(i, pathname));
  const moreCount = rest.reduce((n, i) => n + (i.badge ? badges[i.badge] ?? 0 : 0), 0);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav className="tabs" aria-label={label}>
        <ul>
          {primary.map((item) => (
            <li key={item.href}>
              <ItemLink item={item} current={isCurrent(item, pathname)} count={item.badge ? badges[item.badge] ?? 0 : 0} short />
            </li>
          ))}
          <li>
            <button type="button" aria-expanded={open} aria-haspopup="dialog" className={inMore ? "is-current" : undefined} onClick={() => setOpen(true)}>
              <Icon name="more" />
              <span className="nav-label">{moreLabel}</span>
              {moreCount ? <span className="badge">{moreCount}</span> : null}
            </button>
          </li>
        </ul>
      </nav>
      {open ? (
        <div className="more-root">
          <div className="more-scrim" onClick={() => setOpen(false)} />
          <section className="more-sheet surface-dark" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="more-head">
              <h2 id={titleId}>{allLabel}</h2>
              <button className="icon-btn" type="button" aria-label={closeLabel} onClick={() => setOpen(false)} autoFocus>
                <Icon name="x" />
              </button>
            </div>
            <ul className="more-grid">
              {rest.map((item) => (
                <li key={item.href}>
                  <ItemLink
                    item={item}
                    current={isCurrent(item, pathname)}
                    count={item.badge ? badges[item.badge] ?? 0 : 0}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
            {footer ? <div className="more-foot">{footer}</div> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
