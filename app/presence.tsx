"use client";

import { cloneElement, type ReactElement, useEffect, useRef, useState } from "react";

type PresenceChildProps = {
  className?: string;
  inert?: boolean;
  "aria-hidden"?: boolean;
  "data-motion-state"?: "open" | "closed";
};

type PresenceProps = {
  show: boolean;
  children: () => ReactElement<PresenceChildProps>;
  className: string;
  exitMs?: number;
};

export function Presence({ show, children, className, exitMs = 180 }: PresenceProps) {
  const retainedChild = useRef<ReactElement<PresenceChildProps> | null>(null);
  const [, setExitVersion] = useState(0);
  const visibleChild = show ? children() : null;

  useEffect(() => {
    if (show && visibleChild) retainedChild.current = visibleChild;
  }, [show, visibleChild]);

  useEffect(() => {
    if (show || !retainedChild.current) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => {
      retainedChild.current = null;
      setExitVersion((version) => version + 1);
    }, reducedMotion ? 30 : exitMs);
    return () => window.clearTimeout(timeout);
  }, [exitMs, show]);

  /* eslint-disable react-hooks/refs -- This ref is the committed exit snapshot; the timeout state update invalidates it. */
  const child = visibleChild ?? retainedChild.current;
  if (!child) return null;

  const renderedChild = cloneElement(child, {
    className: [child.props.className, className].filter(Boolean).join(" "),
    "data-motion-state": show ? "open" : "closed",
    "aria-hidden": show ? child.props["aria-hidden"] : true,
    inert: show ? child.props.inert : true,
  });
  /* eslint-enable react-hooks/refs */
  return renderedChild;
}
