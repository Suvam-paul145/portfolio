import { credentials as credentialData, skillGroups as skillData } from "./data.js";

export function renderBlueprint({ skillGroups = skillData, credentials = credentialData, projects = [] }) {
  const skillTarget = document.getElementById("skillGrid");
  const credentialTarget = document.getElementById("credentialList");

  if (skillTarget) {
    const projectMap = new Map();
    projects.forEach((project) => {
      project.relatedSkills.forEach((skillId) => {
        if (!projectMap.has(skillId)) projectMap.set(skillId, []);
        projectMap.get(skillId).push(project.id);
      });
    });

    skillTarget.innerHTML = skillGroups
      .map((group) =>
        group.skills
          .map(([id, label]) => {
            const links = projectMap.get(id) || [];
            return `
              <button class="skill-node is-reveal" type="button" data-skill-id="${id}" data-project-ids="${links.join(",")}">
                <span>${group.group}</span>
                <strong>${label}</strong>
              </button>
            `;
          })
          .join("")
      )
      .join("");
  }

  if (credentialTarget) {
    credentialTarget.innerHTML = credentials
      .map(
        (item) => `
          <article class="credential is-reveal">
            <strong>${item.title}</strong>
            <p>${item.issuer}. ${item.detail}</p>
            <span class="credential-source">${item.source}</span>
          </article>
        `
      )
      .join("");
  }
}

export function initBlueprint() {
  const nodes = document.querySelectorAll(".skill-node");
  const projectCards = document.querySelectorAll(".project-card");

  const clear = () => {
    nodes.forEach((node) => node.classList.remove("is-active"));
    projectCards.forEach((card) => {
      card.classList.remove("is-linked", "is-dimmed");
    });
  };

  nodes.forEach((node) => {
    const projectIds = (node.dataset.projectIds || "").split(",").filter(Boolean);

    node.addEventListener("pointerenter", () => {
      clear();
      node.classList.add("is-active");

      if (!projectIds.length) return;

      projectCards.forEach((card) => {
        const linked = projectIds.includes(card.dataset.projectId);
        card.classList.toggle("is-linked", linked);
        card.classList.toggle("is-dimmed", !linked);
      });
    });

    node.addEventListener("pointerleave", clear);
    node.addEventListener("focus", () => node.dispatchEvent(new PointerEvent("pointerenter")));
    node.addEventListener("blur", clear);
  });
}
