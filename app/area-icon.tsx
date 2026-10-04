export type AreaIconName = "target" | "trend" | "sprout" | "people" | "briefcase" | "heart" | "home" | "book" | "calendar" | "clock" | "star" | "flag" | "wallet" | "chart" | "dumbbell" | "music" | "camera" | "plane" | "car" | "utensils" | "leaf" | "paw" | "globe" | "palette";

export function AreaIcon({ icon }: { icon: AreaIconName }) {
  if (icon === "trend") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9 12l3.5 3.5L20 7m-5 0h5v5" /></svg>;
  if (icon === "sprout") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9m0 4c-4.2 0-7-2.5-7-6.5 4.2 0 7 2.5 7 6.5Zm0-4c3.8 0 6.5-2.2 6.5-5.8C14.7 3.2 12 5.4 12 9Z" /></svg>;
  if (icon === "people") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 19.5v-2.2a4.3 4.3 0 0 1 4.3-4.3h1.4a4.3 4.3 0 0 1 4.3 4.3v2.2m1-7.5h1.2a4 4 0 0 1 4 4v3.5" /></svg>;
  if (icon === "briefcase") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h16v10H4zM9 8.5V6h6v2.5M4 12h16m-9 0v2h2v-2" /></svg>;
  if (icon === "heart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 5.8a4.4 4.4 0 0 0-6.2 0L12 7.7l-1.9-1.9a4.4 4.4 0 0 0-6.3 6.2L12 20l8.2-8a4.4 4.4 0 0 0 0-6.2Z" /></svg>;
  if (icon === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 11 8.5-7 8.5 7M6 9v10h12V9m-8 10v-5h4v5" /></svg>;
  if (icon === "book") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22Zm16 0A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22Z" /></svg>;
  if (icon === "calendar") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a2 2 0 0 1 2 2v13H3v-13a2 2 0 0 1 2-2ZM3 9h18M7 2v5m10-5v5" /></svg>;
  if (icon === "clock") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>;
  if (icon === "star") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></svg>;
  if (icon === "flag") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1h11l-2 3 2 3H5" /></svg>;
  if (icon === "wallet") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h15a2 2 0 0 1 2 2V19H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h13M16 11h5v4h-5a2 2 0 0 1 0-4Z" /></svg>;
  if (icon === "chart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m5 7H2" /></svg>;
  if (icon === "dumbbell") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8v8m-3-6v4m15-6v8m3-6v4M6 12h12M2 9h1m18 0h1M2 15h1m18 0h1" /></svg>;
  if (icon === "music") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12M9 9l10-2M6.5 21A2.5 2.5 0 1 0 6.5 16a2.5 2.5 0 0 0 0 5Zm10-2A2.5 2.5 0 1 0 16.5 14a2.5 2.5 0 0 0 0 5Z" /></svg>;
  if (icon === "camera") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l1.5-2h7L17 7h4v12H3Z" /><circle cx="12" cy="13" r="4" /></svg>;
  if (icon === "plane") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 14 8.5-2.5V5c0-1.7.4-3 1-3s1 1.3 1 3v6.5l8.5 2.5v2L13 15v4l2.5 2v1L12 21l-3.5 1v-1l2.5-2v-4l-8.5 1Z" /></svg>;
  if (icon === "car") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 15 1.5-6h13l1.5 6v4H4Zm2-6 2-4h8l2 4M7 19v2m10-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></svg>;
  if (icon === "utensils") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v7m-3-7v5a3 3 0 0 0 6 0V3M6 11v10m9-10V7a4 4 0 0 1 4-4v18" /></svg>;
  if (icon === "leaf") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4C10 4 5 8 5 14a5 5 0 0 0 5 5c6 0 10-5 10-15ZM4 21c2-5 6-8 12-12" /></svg>;
  if (icon === "paw") return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5" ry="4" /><circle cx="5.5" cy="10" r="2" /><circle cx="9.5" cy="6" r="2" /><circle cx="14.5" cy="6" r="2" /><circle cx="18.5" cy="10" r="2" /></svg>;
  if (icon === "globe") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
  if (icon === "palette") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-3.3-4-6-9-6Z" /><circle cx="7.5" cy="10" r=".8" /><circle cx="10" cy="6.8" r=".8" /><circle cx="15" cy="7" r=".8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2.5V5m9.5 7H19M12 19v2.5M5 12H2.5" /></svg>;
}
