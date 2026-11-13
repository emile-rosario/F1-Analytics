import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import Cabecera from "@/components/Cabecera";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

// La cabecera trae el selector de idioma, que necesita el router de Next.
vi.mock("@/components/SelectorIdioma", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

function pintar(idioma: "es" | "en") {
  return render(
    <NextIntlClientProvider locale={idioma} messages={idioma === "es" ? es : en}>
      <Cabecera />
    </NextIntlClientProvider>,
  );
}

describe("Cabecera", () => {
  it("el enlace al inicio se llama Sector One, en los dos idiomas, y no hay otro nombre", () => {
    for (const idioma of ["es", "en"] as const) {
      const { unmount } = pintar(idioma);

      expect(screen.getByRole("link", { name: "Sector One" })).toHaveAttribute("href", "/");
      expect(screen.queryByText(/F1 Analytics/)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("el monograma es decorativo y el nombre sale de los mensajes, con la inclinación del logo", () => {
    const { container } = pintar("es");

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 125 100");
    expect(screen.getByText("Sector One")).toHaveClass("uppercase", "-skew-x-14");
  });
});
