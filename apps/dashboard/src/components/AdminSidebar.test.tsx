import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = usePathname as unknown as jest.Mock;

const current = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("AdminSidebar active section", () => {
  it("marks Clientes on its own page", () => {
    mockedUsePathname.mockReturnValue("/admin/clientes");
    render(<AdminSidebar />);

    expect(current()).toEqual(["Clientes"]);
  });

  // "/admin/clientes" is a string prefix of "/admin/clientes-asignados".
  // The trailing slash in the startsWith check is what keeps them apart —
  // without it, both entries would light up on the assignments page.
  it("does not mark Clientes while on Clientes asignados", () => {
    mockedUsePathname.mockReturnValue("/admin/clientes-asignados");
    render(<AdminSidebar />);

    expect(current()).toEqual(["Clientes asignados"]);
  });

  it("marks only the portada on /admin", () => {
    mockedUsePathname.mockReturnValue("/admin");
    render(<AdminSidebar />);

    expect(current()).toEqual(["Dashboard"]);
  });

  it("keeps a section marked on its nested routes", () => {
    mockedUsePathname.mockReturnValue("/admin/camiones/T-01");
    render(<AdminSidebar />);

    expect(current()).toEqual(["Camiones"]);
  });
});
