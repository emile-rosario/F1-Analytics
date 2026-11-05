import { describe, expect, it } from "vitest";

import { formatearTiempoVuelta } from "@/lib/formato";

describe("formatearTiempoVuelta", () => {
  it("usa coma decimal en español y punto en inglés", () => {
    expect(formatearTiempoVuelta(79.327, "es")).toBe("1:19,327");
    expect(formatearTiempoVuelta(79.327, "en")).toBe("1:19.327");
  });

  it("completa con ceros los segundos y los milisegundos", () => {
    expect(formatearTiempoVuelta(65.5, "en")).toBe("1:05.500");
    expect(formatearTiempoVuelta(60, "en")).toBe("1:00.000");
  });

  it("redondea al milisegundo más cercano sin pasarse de 60 segundos", () => {
    expect(formatearTiempoVuelta(79.9996, "en")).toBe("1:20.000");
    expect(formatearTiempoVuelta(59.9999, "en")).toBe("1:00.000");
  });

  it("maneja vueltas de más de dos minutos", () => {
    expect(formatearTiempoVuelta(125.004, "es")).toBe("2:05,004");
  });
});
