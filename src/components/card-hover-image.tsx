"use client";

import { useRef, useState } from "react";

const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 419;
const GAP = 8;

export function computeHoverPosition(
  anchor: { top: number; right: number; bottom: number; left: number },
  viewport: { width: number; height: number },
  size: { width: number; height: number } = {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  gap: number = GAP,
): { top: number; left: number } {
  let left = anchor.right + gap;
  if (left + size.width > viewport.width) {
    left = anchor.left - gap - size.width;
  }
  left = Math.max(0, Math.min(left, Math.max(0, viewport.width - size.width)));

  let top = anchor.top;
  if (top + size.height > viewport.height) {
    top = viewport.height - size.height;
  }
  top = Math.max(0, top);

  return { top, left };
}

export function CardHoverImage({
  src,
  alt,
  children,
}: {
  src: string | null;
  alt: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (src === null) return children;

  function onPointerEnter(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(
      computeHoverPosition(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
    setMounted(true);
    setVisible(true);
  }

  function onPointerLeave(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== "mouse") return;
    setVisible(false);
  }

  return (
    <span
      ref={wrapRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
      {mounted && pos && (
        <span
          className={`pointer-events-none fixed z-40 ${visible ? "" : "hidden"}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Hotlinked, no local caching — same no-next/image convention as
              /cards/[code] and card-results.tsx. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={IMAGE_WIDTH}
            height={IMAGE_HEIGHT}
            className="w-[300px] rounded border border-zinc-200 shadow-lg dark:border-zinc-800"
          />
        </span>
      )}
    </span>
  );
}
