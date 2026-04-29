function escapeAttr(value) {
  return String(value).replace(/"/g, "&quot;");
}

export function renderProjects(projects) {
  const target = document.getElementById("projectTrack");
  if (!target) return;

  target.innerHTML = projects
    .map(
      (project, index) => `
        <article class="project-card is-reveal" data-project-id="${project.id}" data-cursor-label="View">
          <header>
            <span class="project-index">${String(index + 1).padStart(2, "0")} / ${project.type}</span>
            <h3>${project.title}</h3>
            <p>${project.summary}</p>
          </header>
          <div class="project-visual" data-shader-seed="${index + 1}" aria-hidden="true"></div>
          <footer class="project-footer">
            <div class="project-stack">
              ${project.stack.map((tag) => `<span class="tag">${tag}</span>`).join("")}
            </div>
            <span class="project-signal">${project.signal}</span>
            <div class="project-links">
              ${project.links
                .map(
                  (link) =>
                    `<a href="${link.href}" target="_blank" rel="noreferrer" data-cursor-label="${escapeAttr(link.label)}">${link.label}</a>`
                )
                .join("")}
            </div>
          </footer>
        </article>
      `
    )
    .join("");
}

class ProjectShader {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false
    });
    this.hover = 0;
    this.targetHover = 0;
    this.mouse = [0.5, 0.5];
    this.seed = Number(container.dataset.shaderSeed || 1);

    if (!this.gl) return;

    container.appendChild(this.canvas);
    this.program = this.createProgram();
    this.locations = {
      time: this.gl.getUniformLocation(this.program, "u_time"),
      resolution: this.gl.getUniformLocation(this.program, "u_resolution"),
      hover: this.gl.getUniformLocation(this.program, "u_hover"),
      mouse: this.gl.getUniformLocation(this.program, "u_mouse"),
      seed: this.gl.getUniformLocation(this.program, "u_seed")
    };

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      this.gl.STATIC_DRAW
    );

    const position = this.gl.getAttribLocation(this.program, "a_position");
    this.gl.enableVertexAttribArray(position);
    this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);

    this.resize();
    this.bind();
  }

  bind() {
    this.container.addEventListener("pointerenter", () => {
      this.targetHover = 1;
    });

    this.container.addEventListener("pointerleave", () => {
      this.targetHover = 0;
    });

    this.container.addEventListener("pointermove", (event) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse[0] = (event.clientX - rect.left) / Math.max(rect.width, 1);
      this.mouse[1] = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    });
  }

  createProgram() {
    const vertex = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragment = `
      precision mediump float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_hover;
      uniform vec2 u_mouse;
      uniform float u_seed;
      varying vec2 v_uv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 19.31) * 43758.5453123);
      }

      float grid(vec2 uv, float scale) {
        vec2 line = abs(fract(uv * scale) - 0.5);
        float d = min(line.x, line.y);
        return smoothstep(0.03, 0.0, d);
      }

      void main() {
        vec2 uv = v_uv;
        vec2 centered = uv - 0.5;
        float aspect = u_resolution.x / max(u_resolution.y, 1.0);
        centered.x *= aspect;

        float pulse = sin((centered.x * 8.0 + centered.y * 5.0) + u_time * 1.2 + u_seed) * 0.5 + 0.5;
        float mouseWave = 1.0 - smoothstep(0.0, 0.55, distance(uv, u_mouse));
        float distortion = (pulse * 0.018 + mouseWave * 0.055) * u_hover;
        uv += normalize(centered + 0.001) * distortion;

        float g1 = grid(uv + vec2(u_time * 0.012, 0.0), 9.0 + u_seed);
        float g2 = grid(uv.yx + vec2(0.0, -u_time * 0.009), 19.0);
        float node = smoothstep(0.22, 0.0, abs(sin((uv.x + uv.y + u_seed) * 13.0 + u_time)));
        float noise = hash(floor(uv * 34.0 + u_time));

        vec3 base = vec3(0.025, 0.024, 0.020);
        vec3 steel = vec3(0.48, 0.54, 0.51);
        vec3 orange = vec3(1.0, 0.341, 0.133);
        vec3 color = base;
        color += steel * g1 * 0.16;
        color += orange * g2 * (0.26 + u_hover * 0.42);
        color += orange * node * mouseWave * (0.12 + u_hover * 0.42);
        color += orange * noise * 0.035;

        float alpha = 0.72 + g1 * 0.18 + g2 * 0.08;
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, vertex);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Project shader link failed.");
    }

    gl.useProgram(program);
    return program;
  }

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || "Project shader compile failed.");
    }

    return shader;
  }

  resize() {
    if (!this.gl) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
  }

  render(time) {
    if (!this.gl) return;
    this.hover += (this.targetHover - this.hover) * 0.08;
    this.gl.useProgram(this.program);
    this.gl.uniform1f(this.locations.time, time * 0.001);
    this.gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.locations.hover, this.hover);
    this.gl.uniform2f(this.locations.mouse, this.mouse[0], this.mouse[1]);
    this.gl.uniform1f(this.locations.seed, this.seed);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }
}

export function initProjects() {
  const shaders = [];
  document.querySelectorAll(".project-visual").forEach((container) => {
    try {
      shaders.push(new ProjectShader(container));
    } catch (error) {
      container.dataset.shaderError = "true";
      console.warn(error);
    }
  });

  if (!shaders.length) return;

  const resize = () => shaders.forEach((shader) => shader.resize());
  window.addEventListener("resize", resize, { passive: true });

  const animate = (time) => {
    shaders.forEach((shader) => shader.render(time));
    requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
}
