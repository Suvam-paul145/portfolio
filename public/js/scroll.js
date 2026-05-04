export function initScroll({ engine } = {}) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!gsap || !ScrollTrigger) {
    document.querySelectorAll(".is-reveal").forEach((el) => {
      el.style.opacity = 1;
      el.style.transform = "none";
    });
    return null;
  }

  gsap.registerPlugin(ScrollTrigger);

  const lenis = initLenis({ ScrollTrigger, reducedMotion });
  initAnchorNavigation(lenis);
  initHeaderState();
  initBootSequence({ gsap, ScrollTrigger, reducedMotion });
  initReveals({ gsap, ScrollTrigger, reducedMotion });
  initHorizontalLab({ gsap, ScrollTrigger, reducedMotion });
  initBlueprintLines({ gsap, ScrollTrigger });
  initVanguardBatch({ gsap, ScrollTrigger, reducedMotion });
  initSignalCards({ gsap, ScrollTrigger, reducedMotion });
  initFuture({ gsap, ScrollTrigger, engine });
  initActiveNav({ ScrollTrigger });

  requestAnimationFrame(() => ScrollTrigger.refresh());
  return lenis;
}

function initLenis({ ScrollTrigger, reducedMotion }) {
  if (reducedMotion || !window.Lenis) return null;

  const lenis = new window.Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1
  });

  lenis.on("scroll", ScrollTrigger.update);

  window.gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  window.gsap.ticker.lagSmoothing(0);

  return lenis;
}

function initAnchorNavigation(lenis) {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href");
      const target = id ? document.querySelector(id) : null;
      if (!target) return;

      event.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: -72 });
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

function initHeaderState() {
  const header = document.getElementById("siteHeader");
  if (!header) return;

  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 20);
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

function initBootSequence({ gsap, ScrollTrigger, reducedMotion }) {
  const lines = document.querySelectorAll("[data-boot-line]");
  const title = document.getElementById("heroTitle");
  const lockup = document.querySelector(".hero-lockup");
  const tunnel = document.querySelector(".letter-tunnel");

  if (reducedMotion) {
    gsap.set(lines, { opacity: 1, y: 0 });
    return;
  }

  gsap.to(lines, {
    opacity: 1,
    y: 0,
    duration: 0.58,
    stagger: 0.15,
    ease: "power2.out"
  });

  if (title) {
    gsap.fromTo(
      title,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, delay: 0.42, ease: "power3.out" }
    );
  }

  if (!lockup) return;

  gsap
    .timeline({
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1
      }
    })
    .to(lockup, { scale: 3.1, xPercent: -10, yPercent: 8, opacity: 0.08, ease: "none" }, 0)
    .to(tunnel, { scale: 1.18, opacity: 0.04, ease: "none" }, 0);
}

function initReveals({ gsap, ScrollTrigger, reducedMotion }) {
  const elements = gsap.utils.toArray(".is-reveal");

  if (reducedMotion) {
    gsap.set(elements, { opacity: 1, y: 0, rotation: 0, scale: 1 });
    return;
  }

  elements.forEach((element) => {
    gsap.from(
      element,
      {
        opacity: 0,
        y: 32,
        duration: 0.8,
        immediateRender: false,
        ease: "power3.out",
        scrollTrigger: {
          trigger: element,
          start: "top 88%",
          toggleActions: "play none none reverse"
        }
      }
    );
  });
}

function initHorizontalLab({ gsap, ScrollTrigger, reducedMotion }) {
  const wrapper = document.getElementById("projectHorizontal");
  const track = document.getElementById("projectTrack");
  if (!wrapper || !track || reducedMotion) return;

  ScrollTrigger.matchMedia({
    "(min-width: 821px)": function () {
      const tween = gsap.to(track, {
        x: () => {
          const distance = track.scrollWidth - window.innerWidth;
          return distance > 0 ? -distance : 0;
        },
        ease: "none",
        scrollTrigger: {
          trigger: wrapper,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          end: () => `+=${Math.max(track.scrollWidth, window.innerWidth)}`
        }
      });

      gsap.to(".lab-rails span:nth-child(1)", {
        xPercent: -14,
        ease: "none",
        scrollTrigger: {
          trigger: wrapper,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });

      gsap.to(".lab-rails span:nth-child(2)", {
        xPercent: 22,
        ease: "none",
        scrollTrigger: {
          trigger: wrapper,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });

      return () => tween.kill();
    }
  });
}

function initBlueprintLines({ gsap, ScrollTrigger }) {
  document.querySelectorAll(".schematic-lines path").forEach((path) => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;

    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 1.5,
      ease: "power2.out",
      scrollTrigger: {
        trigger: ".blueprint",
        start: "top 72%",
        toggleActions: "play none none reverse"
      }
    });
  });
}

function initVanguardBatch({ gsap, ScrollTrigger, reducedMotion }) {
  if (reducedMotion) return;

  ScrollTrigger.batch(".vanguard-card", {
    start: "top 88%",
    onEnter: (batch) => {
      gsap.fromTo(
        batch,
        { opacity: 0, y: 34, rotate: -1.5, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          rotate: 0,
          scale: 1,
          duration: 0.75,
          stagger: 0.08,
          ease: "power3.out"
        }
      );
    }
  });
}

function initSignalCards({ gsap, ScrollTrigger, reducedMotion }) {
  if (reducedMotion) return;

  const cards = gsap.utils.toArray(".signal-card");
  if (!cards.length) return;

  ScrollTrigger.batch(cards, {
    start: "top 90%",
    onEnter: (batch) => {
      gsap.fromTo(
        batch,
        { opacity: 0, y: 44, rotateX: -6, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          scale: 1,
          duration: 0.9,
          stagger: 0.12,
          ease: "power4.out"
        }
      );
    },
    onLeaveBack: (batch) => {
      gsap.to(batch, { opacity: 0, y: 24, duration: 0.4, ease: "power2.out" });
    }
  });
}

function initFuture({ gsap, ScrollTrigger, engine }) {
  const items = gsap.utils.toArray(".future-item");
  const readout = document.getElementById("futureReadout");
  if (!items.length) return;

  const activate = (activeItem, index) => {
    items.forEach((item) => item.classList.toggle("is-active", item === activeItem));
    if (readout) readout.textContent = activeItem.querySelector("h3")?.textContent || "";
    const intensity = Math.min(1, 0.25 + index * 0.17);
    document.documentElement.style.setProperty("--future-intensity", intensity.toFixed(2));
    engine?.setPreset?.(activeItem.dataset.futurePreset || "core", index);
  };

  items.forEach((item, index) => {
    ScrollTrigger.create({
      trigger: item,
      start: "top 56%",
      end: "bottom 44%",
      onEnter: () => activate(item, index),
      onEnterBack: () => activate(item, index)
    });
  });
}

function initActiveNav({ ScrollTrigger }) {
  const links = Array.from(document.querySelectorAll(".site-nav a"));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  sections.forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: "top center",
      end: "bottom center",
      onToggle: (self) => {
        if (!self.isActive) return;
        links.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${section.id}`);
        });
      }
    });
  });
}
