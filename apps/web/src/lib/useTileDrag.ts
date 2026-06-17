import { useRef, useState, type PointerEvent } from "react";
import type { MoveItem } from "../components/MoveModal";

/**
 * Pointer-based drag-and-drop that works on touch *and* mouse.
 *
 * Native HTML5 drag-and-drop does not fire on touchscreens, so dragging a tile
 * onto a folder never registered a drop on a phone. This implements it with
 * Pointer Events instead:
 *   - touch: press-and-hold (~250ms) to pick up, then drag; a normal tap still
 *     navigates/opens, and an early swipe still scrolls the page.
 *   - mouse: press and move past a small threshold to pick up.
 *
 * Drop targets are any element carrying a `data-drop-folder="<id>"` attribute;
 * the folder under the pointer is found with elementFromPoint on every move.
 */
export function useTileDrag(onDropInto: (item: MoveItem, folderId: string) => void) {
  const [active, setActive] = useState<MoveItem | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const stateRef = useRef<{
    item: MoveItem;
    pointerId: number;
    startX: number;
    startY: number;
    el: HTMLElement;
    pointerType: string;
    dragging: boolean;
    over: string | null;
    timer: number | null;
  } | null>(null);
  const justDragged = useRef(false);

  const LONG_PRESS_MS = 250;
  const MOVE_THRESHOLD = 8;

  const begin = () => {
    const s = stateRef.current;
    if (!s || s.dragging) return;
    s.dragging = true;
    try {
      s.el.setPointerCapture(s.pointerId);
    } catch {
      /* capture may fail if the pointer already released */
    }
    setActive(s.item);
    setGhost({ x: s.startX, y: s.startY });
    setOverId(null);
  };

  const reset = () => {
    const s = stateRef.current;
    if (s?.timer) clearTimeout(s.timer);
    stateRef.current = null;
    setActive(null);
    setGhost(null);
    setOverId(null);
  };

  const hitTest = (x: number, y: number, item: MoveItem): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const folderEl = el?.closest("[data-drop-folder]") as HTMLElement | null;
    const id = folderEl?.getAttribute("data-drop-folder") ?? null;
    if (!id) return null;
    if (item.type === "folder" && id === item.id) return null; // can't drop a folder into itself
    return id;
  };

  const onPointerDown = (e: PointerEvent, item: MoveItem) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const s = {
      item,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el,
      pointerType: e.pointerType,
      dragging: false,
      over: null as string | null,
      timer: null as number | null,
    };
    stateRef.current = s;
    if (e.pointerType !== "mouse") {
      s.timer = window.setTimeout(() => {
        if (stateRef.current === s) begin();
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;
    if (!s.dragging) {
      const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
      if (moved <= MOVE_THRESHOLD) return;
      if (s.pointerType === "mouse") {
        begin();
      } else {
        // A swipe before the long-press fires is a scroll — let it go.
        if (s.timer) clearTimeout(s.timer);
        stateRef.current = null;
        return;
      }
    }
    e.preventDefault();
    const over = hitTest(e.clientX, e.clientY, s.item);
    s.over = over;
    setGhost({ x: e.clientX, y: e.clientY });
    setOverId(over);
  };

  const onPointerUp = () => {
    const s = stateRef.current;
    if (s?.dragging) {
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 400);
      if (s.over) onDropInto(s.item, s.over);
    }
    reset();
  };

  const onPointerCancel = () => reset();

  /** Spread onto a draggable tile. */
  const bind = (item: MoveItem) => ({
    onPointerDown: (e: PointerEvent) => onPointerDown(e, item),
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    draggable: false,
  });

  /** Wrap a tile's click so it's ignored right after a drag. */
  const click = (fn: () => void) => () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    fn();
  };

  return { active, ghost, overId, bind, click };
}
