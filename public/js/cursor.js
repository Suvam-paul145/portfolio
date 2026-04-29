export function initCursor() {
  const cursor = document.getElementById("cursorDot");
  if (!cursor || window.matchMedia("(pointer: coarse)").matches) return;

  const label = cursor.querySelector("span");
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let tx = x;
  let ty = y;

  document.addEventListener(
    "pointermove",
    (event) => {
      tx = event.clientX;
      ty = event.clientY;
      cursor.classList.add("is-visible");
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () => {
    cursor.classList.remove("is-visible");
  });

  document.querySelectorAll("a, button, [data-cursor-label]").forEach((element) => {
    element.addEventListener("pointerenter", () => {
      const text = element.dataset.cursorLabel || "Open";
      if (label) label.textContent = text;
      cursor.classList.add("is-expanded");
    });

    element.addEventListener("pointerleave", () => {
      cursor.classList.remove("is-expanded");
    });
  });

  const render = () => {
    x += (tx - x) * 0.18;
    y += (ty - y) * 0.18;
    cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}
