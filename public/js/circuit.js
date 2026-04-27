// Shared circuit canvas — theme-aware
(function () {
  const canvas = document.getElementById('circuit-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const nodes = [];
  const NUM   = 28;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  for (let i = 0; i < NUM; i++) {
    nodes.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: rnd(-0.15, 0.15), vy: rnd(-0.15, 0.15),
      r: rnd(2.5, 4.5),
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: rnd(0.01, 0.03),
    });
  }

  const signals = [];
  function spawnSignal() {
    if (nodes.length < 2) return;
    const a = Math.floor(Math.random() * nodes.length);
    let b = Math.floor(Math.random() * nodes.length);
    while (b === a) b = Math.floor(Math.random() * nodes.length);
    const na = nodes[a], nb = nodes[b];
    if (Math.hypot(nb.x - na.x, nb.y - na.y) > 250) return;
    signals.push({ ax: na.x, ay: na.y, bx: nb.x, by: nb.y, t: 0, speed: rnd(0.004, 0.01) });
  }

  let frame = 0;
  function draw() {
    requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    if (frame % 90 === 0) spawnSignal();

    const light = isLight();
    // In light mode use darker, more saturated colors so they read on pale backgrounds
    const edgeColor   = light ? '90,40,200'   : '124,58,237';
    const nodeColor   = light ? '109,40,217'  : '167,139,250';
    const glowColor   = light ? '109,40,217'  : '124,58,237';
    const signalColor = light ? '0,150,190'   : '6,182,212';
    const edgeAlphaMul = light ? 0.45 : 0.15;
    const nodeAlphaMul = light ? 1.0  : 1.0;

    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy; n.pulse += n.pulseSpeed;
      if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    });

    // Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist < 220) {
          const alpha = (1 - dist / 220) * edgeAlphaMul;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${edgeColor},${alpha})`;
          ctx.lineWidth = light ? 1.2 : 0.8;
          ctx.stroke();
        }
      }
    }

    // Nodes
    nodes.forEach(n => {
      const pulse = 0.5 + 0.5 * Math.sin(n.pulse);
      const alpha = (0.35 + pulse * 0.5) * nodeAlphaMul;
      const r = n.r * (0.8 + pulse * 0.4);

      // Glow
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
      const glowAlpha = light ? alpha * 0.35 : alpha * 0.4;
      grd.addColorStop(0, `rgba(${glowColor},${glowAlpha})`);
      grd.addColorStop(1, `rgba(${glowColor},0)`);
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();

      // Core dot
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${nodeColor},${alpha})`; ctx.fill();
    });

    // Signals (travelling cyan dots on edges)
    for (let i = signals.length - 1; i >= 0; i--) {
      const s = signals[i];
      s.t += s.speed;
      if (s.t >= 1) { signals.splice(i, 1); continue; }
      const x = s.ax + (s.bx - s.ax) * s.t;
      const y = s.ay + (s.by - s.ay) * s.t;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 8);
      grd.addColorStop(0, `rgba(${signalColor},0.9)`);
      grd.addColorStop(1, `rgba(${signalColor},0)`);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${signalColor},1)`; ctx.fill();
    }
  }
  draw();
})();
