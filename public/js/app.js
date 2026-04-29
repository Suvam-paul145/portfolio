import {
  credentials,
  futurePlans,
  mission,
  projects,
  skillGroups,
  vanguardItems
} from "./data.js";
import { initBlueprint, renderBlueprint } from "./blueprint.js";
import { initContactForm } from "./contact.js";
import { initCursor } from "./cursor.js";
import { initProjects, renderProjects } from "./projects.js";
import { initScroll } from "./scroll.js";
import { initThreeEngine } from "./three-engine.js";

function renderMission() {
  const target = document.getElementById("missionGrid");
  if (!target) return;

  target.innerHTML = mission
    .map(
      (item) => `
        <div class="mission-cell is-reveal">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderVanguard() {
  const target = document.getElementById("vanguardGrid");
  if (!target) return;

  target.innerHTML = vanguardItems
    .map(
      (item) => `
        <a class="vanguard-card is-reveal" href="${item.href}" target="_blank" rel="noreferrer" data-cursor-label="View">
          <span class="vanguard-type">${item.type}</span>
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
        </a>
      `
    )
    .join("");
}

function renderFuture() {
  const target = document.getElementById("futureList");
  if (!target) return;

  target.innerHTML = futurePlans
    .map(
      (item, index) => `
        <article class="future-item is-reveal${index === 0 ? " is-active" : ""}" data-future-preset="${item.preset}">
          <span class="future-phase">${item.phase}</span>
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
          <div class="future-tags">
            ${item.tags.map((tag) => `<span>${tag}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function initNavigation() {
  const nav = document.getElementById("siteNav");
  const toggle = document.getElementById("navToggle");
  if (!nav || !toggle) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initVideo() {
  const video = document.querySelector(".avatar-video");
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const play = () => {
    const promise = video.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {});
    }
  };

  if (video.readyState >= 2) {
    play();
  } else {
    video.addEventListener("loadeddata", play, { once: true });
  }

  video.addEventListener("contextmenu", (event) => event.preventDefault());
}

function initYear() {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
}

renderMission();
renderProjects(projects);
renderBlueprint({ skillGroups, credentials, projects });
renderVanguard();
renderFuture();

initNavigation();
initVideo();
initYear();
initCursor();

const engine = initThreeEngine();

initProjects();
initBlueprint(projects);
initContactForm();
initScroll({ engine });
