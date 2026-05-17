const GLOBAL_HEADER_PX = 64;
const SCROLL_GAP_PX = 12;

export function scrollToMarathonDay(day: number) {
  const target = document.getElementById(`marathon-day-${day}`);
  if (!target) return;

  const sticky = document.getElementById("marathon-events-sticky-header");
  const stickyHeight = sticky?.offsetHeight ?? 0;
  const top =
    window.scrollY +
    target.getBoundingClientRect().top -
    GLOBAL_HEADER_PX -
    stickyHeight -
    SCROLL_GAP_PX;

  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}
