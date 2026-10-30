import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import earthImage from "../public/earth-day.jpg";
import { routeFrame, pointAt, surfaceAt } from "./physics.mjs";

const v3 = (p) => new THREE.Vector3(...p);
const dispose = (object) => {
  object.traverse((o) => {
    o.geometry?.dispose();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
    else o.material?.dispose();
  });
  object.clear();
};

export class EarthScene {
  constructor(container, labels, onFrame) {
    this.container = container;
    this.labels = labels;
    this.onFrame = onFrame;
    this.progress = 0.27;
    this.playing = true;
    this.playbackSeconds = 22;
    this.cutaway = true;
    this.showSurface = true;
    this.showDirect = true;
    this.autoOrbit = false;
    this.flyThrough = false;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.playing = !this.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, innerWidth < 700 ? 1.6 : 2),
    );
    this.renderer.setClearColor(0x050b10, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D Earth comparing a curved gravity tunnel and a straight direct path. Drag to orbit and scroll to zoom.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.001, 100);
    this.camera.position.set(0, 0, 4.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 7;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.autoRotateSpeed = 0.32;
    this.controls.addEventListener("start", () => {
      this.cameraTarget = null;
    });
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    const texture = new THREE.TextureLoader().load(earthImage);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.earthMaterial = new THREE.MeshPhongMaterial({
      map: texture,
      color: 0xbad8cf,
      specular: 0x234b53,
      shininess: 16,
      clippingPlanes: [this.cutPlane],
    });
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 112, 80),
      this.earthMaterial,
    );
    this.world.add(this.earth);
    this.scene.add(new THREE.AmbientLight(0xa6cbda, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff4dc, 2.1);
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0x63d9cf, 0.7);
    fill.position.set(-5, -3, 4);
    this.scene.add(fill);

    this.atmosMaterial = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x4ad3ca) } },
      vertexShader:
        "varying vec3 vNormal; varying vec3 vPosition; void main(){vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*p;}",
      fragmentShader:
        "uniform vec3 glowColor;varying vec3 vNormal;varying vec3 vPosition;void main(){float f=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),3.5);gl_FragColor=vec4(glowColor,f*0.3);}",
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.atmos = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 64),
      this.atmosMaterial,
    );
    this.world.add(this.atmos);
    this.section = new THREE.Group();
    this.diskMaterial = new THREE.ShaderMaterial({
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);
          vec3 c=mix(vec3(.20,.075,.045),vec3(.47,.22,.12),1.-smoothstep(.55,.995,r));
          if(r<.5462)c=mix(vec3(.91,.44,.14),vec3(.56,.19,.075),smoothstep(.192,.5462,r));
          if(r<.1916)c=mix(vec3(1.,.91,.61),vec3(1.,.65,.27),r/.1916);
          if(r>.988)c=vec3(.045,.24,.24);
          float grain=(hash(vUv*1600.)-.5)*.045;
          float flow=sin(r*110.+sin(a*13.)*.7+sin(a*29.+r*8.)*.3)*.014;
          c+=grain+flow;
          gl_FragColor=vec4(c,1.);
        }`,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 192),
      this.diskMaterial,
    );
    this.section.add(disk);
    for (const [radius, color, opacity] of [
      [0.1916, 0xffdf9a, 0.7],
      [0.5462, 0xf3a46b, 0.45],
      [0.989, 0x64d8c1, 0.65],
      [1, 0x7ce6d5, 0.7],
    ]) {
      const line = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.0013, radius + 0.0013, 192),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      line.position.z = 0.002;
      this.section.add(line);
    }
    this.world.add(this.section);
    this.grid = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x67b3bd,
      transparent: true,
      opacity: 0.115,
      depthWrite: false,
      clippingPlanes: [this.cutPlane],
    });
    for (let lat = -60; lat <= 60; lat += 30) {
      const points = Array.from({ length: 145 }, (_, i) => {
        const a = (i / 144) * Math.PI * 2,
          l = (lat * Math.PI) / 180;
        return new THREE.Vector3(
          Math.cos(l) * Math.cos(a) * 1.003,
          Math.sin(l) * 1.003,
          Math.cos(l) * Math.sin(a) * 1.003,
        );
      });
      this.grid.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          gridMat,
        ),
      );
    }
    for (let lon = 0; lon < 180; lon += 30) {
      const a = (lon * Math.PI) / 180,
        points = Array.from({ length: 145 }, (_, i) => {
          const t = (i / 144) * Math.PI * 2;
          return new THREE.Vector3(
            Math.sin(t) * Math.cos(a) * 1.003,
            Math.cos(t) * 1.003,
            Math.sin(t) * Math.sin(a) * 1.003,
          );
        });
      this.grid.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          gridMat,
        ),
      );
    }
    this.world.add(this.grid);
    this.routeGroup = new THREE.Group();
    this.world.add(this.routeGroup);
    this.particleGroup = new THREE.Group();
    this.world.add(this.particleGroup);
    this.pod = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf2fff1, depthTest: false }),
    );
    this.pod.renderOrder = 20;
    this.particleGroup.add(this.pod);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext("2d"),
      gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(210,255,220,1)");
    gradient.addColorStop(0.2, "rgba(125,255,182,.65)");
    gradient.addColorStop(1, "rgba(80,255,170,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTexture = new THREE.CanvasTexture(glowCanvas);
    this.podGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.podGlow.scale.setScalar(0.13);
    this.podGlow.renderOrder = 21;
    this.particleGroup.add(this.podGlow);
    this.trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xc9ffb0,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      }),
    );
    this.trail.renderOrder = 19;
    this.particleGroup.add(this.trail);

    // Deterministic distant stars. No network or random visual changes on reload.
    const starPositions = [],
      starColors = [];
    for (let i = 0; i < 650; i++) {
      const t = i * 2.3999632,
        z = 1 - (2 * (i + 0.5)) / 650,
        r = Math.sqrt(1 - z * z);
      starPositions.push(Math.cos(t) * r * 18, z * 18, Math.sin(t) * r * 18);
      const c = 0.35 + (Math.sin(i * 73.1) * 0.5 + 0.5) * 0.55;
      starColors.push(c * 0.75, c * 0.88, c);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    starsGeo.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(starColors, 3),
    );
    this.stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({
        size: 0.025,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.stars);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.lastTime = performance.now();
    this.animation = requestAnimationFrame((t) => this.animate(t));
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setRoute(route) {
    this.route = route;
    this.frame = routeFrame(route.origin, route.destination);
    this.progress = 0;
    this.flyThrough = false;
    this.controls.enabled = true;
    dispose(this.routeGroup);
    const normal = v3(this.frame.a).cross(v3(this.frame.tangent)).normalize();
    this.normal = normal;
    this.cutPlane.normal.copy(normal).negate();
    this.section.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
    this.section.position.copy(normal).multiplyScalar(0.003);
    // Keep both geometries visible; the selected mode determines capsule motion.
    const points = Array.from({ length: route.path.length }, (_, i) =>
      v3(
        pointAt(this.frame, i / (route.path.length - 1), "fastest"),
      ).addScaledVector(normal, 0.014),
    );
    const curve = new THREE.CatmullRomCurve3(points);
    const tunnel = new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(160, points.length),
        0.004,
        8,
        false,
      ),
      new THREE.MeshBasicMaterial({ color: 0xbdff80, depthTest: false }),
    );
    tunnel.renderOrder = 10;
    this.routeGroup.add(tunnel);
    const tunnelGlow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 160, 0.012, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0xa7ff7c,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    tunnelGlow.renderOrder = 9;
    this.routeGroup.add(tunnelGlow);
    const surfacePoints = Array.from({ length: 161 }, (_, i) =>
      v3(surfaceAt(this.frame, i / 160))
        .multiplyScalar(1.015)
        .addScaledVector(normal, 0.012),
    );
    this.surfaceLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(surfacePoints),
      new THREE.LineDashedMaterial({
        color: 0x9fb9bb,
        dashSize: 0.025,
        gapSize: 0.019,
        transparent: true,
        opacity: 0.65,
        depthTest: false,
      }),
    );
    this.surfaceLine.computeLineDistances();
    this.surfaceLine.renderOrder = 8;
    this.surfaceLine.visible = this.showSurface;
    this.routeGroup.add(this.surfaceLine);
    const chord = new THREE.LineCurve3(
      v3(this.frame.a).addScaledVector(normal, 0.014),
      v3(this.frame.b).addScaledVector(normal, 0.014),
    );
    this.directPath = new THREE.Group();
    const directLine = new THREE.Mesh(
      new THREE.TubeGeometry(chord, 1, 0.0038, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0x7bdbff,
        depthTest: false,
        depthWrite: false,
      }),
    );
    directLine.renderOrder = 11;
    const directGlow = new THREE.Mesh(
      new THREE.TubeGeometry(chord, 1, 0.011, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0x7bdbff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    directGlow.renderOrder = 9;
    this.directPath.add(directLine, directGlow);
    this.directPath.visible = this.showDirect;
    this.routeGroup.add(this.directPath);
    this.trail.material.color.setHex(
      route.mode === "straight" ? 0x9ce7ff : 0xc9ffb0,
    );
    this.markerPositions = [points[0], points[points.length - 1]];
    this.markerPositions.forEach((p, i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 20, 16),
        new THREE.MeshBasicMaterial({
          color: i ? 0xd8f8ff : 0xc5ff8d,
          depthTest: false,
        }),
      );
      m.position.copy(p);
      m.renderOrder = 15;
      this.routeGroup.add(m);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.024, 0.027, 32),
        new THREE.MeshBasicMaterial({
          color: i ? 0xbde9ef : 0xc5ff8d,
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      ring.position.copy(p).addScaledVector(normal, 0.005);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      ring.renderOrder = 14;
      this.routeGroup.add(ring);
    });
    this.homePosition = this.homeForRoute();
    this.cameraTarget = this.homePosition.clone();
    this.updatePod();
  }

  homeForRoute() {
    // View the cut face obliquely, retaining a textured crescent of the globe.
    const mid = v3(surfaceAt(this.frame, 0.5));
    const position = this.normal
      .clone()
      .multiplyScalar(3.45)
      .addScaledVector(mid, 1.55);
    this.camera.up.set(0, 1, 0);
    return position.multiplyScalar(
      1 + Math.max(0, 1.1 - this.camera.aspect) * 0.35,
    );
  }

  setCutaway(value) {
    this.cutaway = value;
    this.section.visible = value;
    this.earthMaterial.clippingPlanes = value ? [this.cutPlane] : [];
    this.earthMaterial.needsUpdate = true;
    this.grid.traverse((o) => {
      if (o.material) {
        o.material.clippingPlanes = value ? [this.cutPlane] : [];
        o.material.needsUpdate = true;
      }
    });
  }
  setSurface(value) {
    this.showSurface = value;
    if (this.surfaceLine) this.surfaceLine.visible = value;
  }
  setDirect(value) {
    this.showDirect = value;
    if (this.directPath) this.directPath.visible = value;
  }
  setProgress(value) {
    this.progress = Math.max(0, Math.min(1, value));
    this.updatePod();
  }
  resetView() {
    this.flyThrough = false;
    this.controls.enabled = true;
    this.controls.target.set(0, 0, 0);
    this.cameraTarget = this.homePosition?.clone();
  }
  setFlyThrough(value) {
    this.flyThrough = value;
    this.controls.enabled = !value;
    if (!value) this.resetView();
  }
  zoom(delta) {
    this.camera.position.multiplyScalar(delta);
    this.cameraTarget = null;
    this.controls.update();
  }

  updatePod() {
    if (!this.frame) return;
    const p = v3(
      pointAt(this.frame, this.progress, this.route.mode),
    ).addScaledVector(this.normal, 0.026);
    this.pod.position.copy(p);
    this.podGlow.position.copy(p);
    const points = Array.from({ length: 36 }, (_, i) =>
      v3(
        pointAt(
          this.frame,
          Math.max(0, this.progress - 0.11 + (i / 35) * 0.11),
          this.route.mode,
        ),
      ).addScaledVector(this.normal, 0.025),
    );
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  animate(time) {
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (document.hidden) {
      this.animation = requestAnimationFrame((t) => this.animate(t));
      return;
    }
    if (this.frame) {
      if (this.playing && this.route.travel_time_seconds > 0) {
        this.progress += dt / this.playbackSeconds;
        if (this.progress > 1.075) this.progress = 0;
        this.updatePod();
      }
      const f = Math.min(1, this.progress);
      if (this.cameraTarget) {
        this.camera.position.lerp(this.cameraTarget, 0.035);
        if (this.camera.position.distanceTo(this.cameraTarget) < 0.008)
          this.cameraTarget = null;
      }
      if (this.flyThrough) {
        // A close tracking camera outside the section keeps the journey readable.
        const p = v3(pointAt(this.frame, f, this.route.mode));
        const desired = p
          .clone()
          .multiplyScalar(0.55)
          .addScaledVector(this.normal, 1.65);
        this.camera.position.lerp(desired, 0.035);
        this.controls.target.lerp(p.clone().multiplyScalar(0.65), 0.04);
      }
      this.controls.autoRotate =
        this.autoOrbit && !this.reducedMotion && !this.flyThrough;
      this.controls.update();
      this.sun.position
        .copy(this.camera.position)
        .add(new THREE.Vector3(-2, 3, 1));
      this.markerPositions?.forEach((p, i) => {
        const projected = p.clone().project(this.camera),
          el = this.labels[i];
        const w = this.container.clientWidth,
          h = this.container.clientHeight;
        const pixelX = (projected.x * 0.5 + 0.5) * w;
        el.style.left = `${pixelX}px`;
        el.style.top = `${(-projected.y * 0.5 + 0.5) * h}px`;
        const left = pixelX > w - 145;
        el.classList.toggle("anchor-left", left);
        el.style.transform = left
          ? "translate(calc(-100% - 16px),-50%)"
          : "translate(16px,-50%)";
        el.style.opacity =
          projected.z < 1 &&
          Math.abs(projected.x) < 1.02 &&
          Math.abs(projected.y) < 0.96 &&
          !this.flyThrough
            ? "1"
            : "0";
      });
      if (!this.lastUi || time - this.lastUi > 70) {
        this.onFrame?.({
          fraction: f,
          playing: this.playing,
          depth: Math.max(
            0,
            (1 - v3(pointAt(this.frame, f, this.route.mode)).length()) * 6371,
          ),
        });
        this.lastUi = time;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.animation = requestAnimationFrame((t) => this.animate(t));
  }
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  destroy() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    dispose(this.scene);
    this.renderer.dispose();
  }
}
