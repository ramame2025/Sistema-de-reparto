"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/camiones", label: "Camiones" },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones del panel"
      className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 md:min-h-screen md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <p className="hidden px-3 pb-4 text-sm font-semibold uppercase tracking-wide text-sky-700 md:block">
        Distribuidor
      </p>
      {NAV_ITEMS.map((item) => {
        // `/admin` es prefijo de todas las demas secciones, asi que la
        // portada solo matchea exacto: con startsWith quedaria marcada
        // siempre, en cualquier pagina del panel.
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-sky-700 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
