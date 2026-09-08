"use client";

import autoAnimate, { type AnimationController, type AutoAnimationPlugin } from "@formkit/auto-animate";

/** React 19 callback ref: each list owns its observers and cleans them up on unmount. */
export function listMotionRef(parent: HTMLElement | null) {
  if (!parent) return;
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let controller: AnimationController | undefined;

  const animate: AutoAnimationPlugin = (element, action, before, after) => {
    // Disclosures already retain and animate their own content with Presence.
    if (element.hasAttribute("data-motion-state")) return new KeyframeEffect(element, [], { duration: 0 });
    if (action === "remove") {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("data-list-exiting", "");
      return new KeyframeEffect(element, [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-3px)" },
      ], { duration: 130, easing: "ease-out" });
    }
    if (action === "add") {
      return new KeyframeEffect(element, [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 200, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    // Drag transforms belong to the drag controller. Containers resize
    // naturally; only their surviving rows move into their new positions.
    const moving = element !== parent && before && after && !element.matches(".dragging, .moving, .resizing");
    return new KeyframeEffect(element, moving ? [
      { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` },
      { transform: "translate(0, 0)" },
    ] : [], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" });
  };

  function stop() {
    controller?.destroy?.();
    controller = undefined;
    // A cancelled exit has no finish event; remove its retained DOM explicitly.
    parent!.querySelectorAll(":scope > [data-list-exiting]").forEach((element) => element.remove());
  }

  function syncPreference() {
    stop();
    if (!preference.matches) controller = autoAnimate(parent!, animate);
  }

  syncPreference();
  preference.addEventListener("change", syncPreference);
  return () => {
    preference.removeEventListener("change", syncPreference);
    stop();
  };
}
