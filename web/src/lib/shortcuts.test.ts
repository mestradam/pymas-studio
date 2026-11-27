import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModelStore } from "../store/useModelStore";
import { loadFixture } from "../engine/testUtils";
import { SHORTCUTS, dispatchShortcut, type ShortcutKeyEvent } from "./shortcuts";

const context = { toggleSidebar: vi.fn(() => true), toggleHelp: vi.fn() };

function press(code: string, extra: Partial<ShortcutKeyEvent> = {}) {
  return dispatchShortcut(
    {
      code,
      key: code.replace(/^Key/, "").toLowerCase(),
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: null,
      ...extra,
    },
    context,
  );
}

describe("atajos de teclado", () => {
  beforeEach(() => {
    useModelStore.setState({ model: loadFixture("F3_analisis_reparacion.json").model });
  });

  it("no repite teclas en el registro", () => {
    const codes = SHORTCUTS.flatMap((shortcut) => shortcut.codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("alterna capas y geometría", () => {
    const before = useModelStore.getState();
    press("KeyN");
    expect(useModelStore.getState().showNodes).toBe(!before.showNodes);
    press("KeyL");
    expect(useModelStore.getState().showLoads).toBe(!before.showLoads);
    press("KeyC");
    expect(useModelStore.getState().showLabels).toBe(!before.showLabels);
    const outcome = press("KeyE");
    expect(useModelStore.getState().renderMode).not.toBe(before.renderMode);
    expect(outcome).toMatchObject({ kind: "handled" });
  });

  it("ignora teclas con Ctrl/Meta/Alt, repetidas o al escribir", () => {
    const before = useModelStore.getState().showGrid;
    expect(press("KeyG", { ctrlKey: true }).kind).toBe("ignored");
    expect(press("KeyG", { metaKey: true }).kind).toBe("ignored");
    expect(press("KeyG", { altKey: true }).kind).toBe("ignored");
    expect(press("KeyG", { repeat: true }).kind).toBe("ignored");
    // Entorno node: un Element mínimo cuyo `closest` encuentra un input.
    class FakeElement {
      closest() {
        return this;
      }
    }
    vi.stubGlobal("Element", FakeElement);
    expect(press("KeyG", { target: new FakeElement() as unknown as EventTarget }).kind).toBe(
      "ignored",
    );
    vi.unstubAllGlobals();
    expect(useModelStore.getState().showGrid).toBe(before);
  });

  it("recorre los patrones con , y . y da la vuelta", () => {
    const model = useModelStore.getState().model!;
    const order = model.loadPatternOrder;
    useModelStore.getState().setActivePattern(order[order.length - 1]!);
    press("Period");
    expect(useModelStore.getState().activePatternId).toBe(order[0]);
    press("Comma");
    expect(useModelStore.getState().activePatternId).toBe(order[order.length - 1]);
  });

  it("? abre la ayuda y B delega en el panel", () => {
    expect(press("Minus", { key: "?" }).kind).toBe("help");
    press("KeyB");
    expect(context.toggleSidebar).toHaveBeenCalled();
  });
});
