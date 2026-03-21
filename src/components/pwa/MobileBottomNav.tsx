"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
};

type MobileBottomNavProps = {
  items: NavItem[];
  accentClassName?: string;
};

export function MobileBottomNav({
  items,
  accentClassName = "text-cyan-300",
}: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav md:hidden">
      <div
        className="mobile-bottom-nav__inner"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav__item ${
                active ? `${accentClassName} bg-white/12` : "text-slate-300"
              }`}
            >
              <span className="text-[11px] font-semibold tracking-wide">
                {item.shortLabel ?? item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
