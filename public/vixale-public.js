"use strict";

for (const toggle of document.querySelectorAll(".vx-public-nav-toggle")) {
  const menu = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!menu) continue;
  const setOpen = open => toggle.setAttribute("aria-expanded", String(open));
  toggle.dataset.enhanced = "true";
  setOpen(false);
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  toggle.parentElement.addEventListener("keydown", event => {
    if (event.key !== "Escape" || toggle.getAttribute("aria-expanded") !== "true") return;
    setOpen(false);
    toggle.focus();
  });
  menu.addEventListener("click", event => {
    if (event.target.closest("a")) setOpen(false);
  });
}

for (const button of document.querySelectorAll("[data-vx-video-src]")) {
  button.addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = button.dataset.vxVideoSrc;
    frame.title = button.textContent.trim();
    frame.allow = "fullscreen; encrypted-media";
    button.replaceWith(frame);
    frame.focus();
  }, { once: true });
}
