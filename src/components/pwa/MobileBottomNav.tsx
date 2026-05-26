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
  const dense = items.length > 4;

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="移动端主导航">
      <div
        className={`mobile-bottom-nav__inner ${dense ? "mobile-bottom-nav__inner--dense" : ""}`}
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
              aria-current={active ? "page" : undefined}
              className={`mobile-bottom-nav__item ${
                active ? `${accentClassName} bg-white/10` : "text-slate-300"
              }`}
            >
              <span className={`${dense ? "text-[10px]" : "text-[11px]"} font-semibold tracking-wide`}>
                {item.shortLabel ?? item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
