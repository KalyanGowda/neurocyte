import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
  brightness: number;
  color: string;
}

interface Pulse {
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
  color: string;
  trail: { x: number; y: number }[];
}

interface Props { phase: 'animating' | 'done'; }

// Steel blue / soft mint / cool white palette
const NODE_COLORS = [
  '#5b8db8', '#5b8db8', '#5b8db8',
  '#7ecfb3', '#7ecfb3',
  '#a0c8dc',
];
const PULSE_COLORS = ['#7ecfb3', '#5b8db8', '#a0ddc8', '#c8e8f4', '#7ecfb3'];

export default function NeuralCanvas({ phase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const NODE_COUNT = 60;
    const MAX_DIST = 175;

    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 1.8 + Math.random() * 3,
      pulsePhase: Math.random() * Math.PI * 2,
      brightness: 0.45 + Math.random() * 0.55,
      color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
    }));

    const pulses: Pulse[] = [];
    let lastPulse = 0;

    const spawnPulse = (t: number) => {
      if (t - lastPulse < 140) return;
      lastPulse = t;
      const batchCount = Math.random() < 0.25 ? 2 : 1;
      for (let b = 0; b < batchCount; b++) {
        const from = Math.floor(Math.random() * NODE_COUNT);
        const candidates: number[] = [];
        for (let i = 0; i < NODE_COUNT; i++) {
          if (i === from) continue;
          const dx = nodes[i].x - nodes[from].x;
          const dy = nodes[i].y - nodes[from].y;
          if (Math.sqrt(dx * dx + dy * dy) < MAX_DIST) candidates.push(i);
        }
        if (!candidates.length) continue;
        const to = candidates[Math.floor(Math.random() * candidates.length)];
        const col = PULSE_COLORS[Math.floor(Math.random() * PULSE_COLORS.length)];
        pulses.push({ fromNode: from, toNode: to, progress: 0, speed: 0.007 + Math.random() * 0.013, color: col, trail: [] });
      }
      if (pulses.length > 28) pulses.splice(0, pulses.length - 28);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = canvas.width + 20;
        if (n.x > canvas.width + 20) n.x = -20;
        if (n.y < -20) n.y = canvas.height + 20;
        if (n.y > canvas.height + 20) n.y = -20;
        n.pulsePhase += 0.016;
      }

      spawnPulse(t);

      // Draw connections
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.22;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(91,141,184,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw pulses with glow trail
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p];
        pulse.progress += pulse.speed;

        if (pulse.progress >= 1) { pulses.splice(p, 1); continue; }

        const from = nodes[pulse.fromNode];
        const to = nodes[pulse.toNode];
        const px = from.x + (to.x - from.x) * pulse.progress;
        const py = from.y + (to.y - from.y) * pulse.progress;

        pulse.trail.push({ x: px, y: py });
        if (pulse.trail.length > 12) pulse.trail.shift();

        // Trail fade
        for (let ti = 0; ti < pulse.trail.length; ti++) {
          const trailAlpha = (ti / pulse.trail.length) * 0.35;
          const trailR = 1.5 * (ti / pulse.trail.length);
          ctx.beginPath();
          ctx.arc(pulse.trail[ti].x, pulse.trail[ti].y, trailR, 0, Math.PI * 2);
          ctx.fillStyle = pulse.color + Math.floor(trailAlpha * 255).toString(16).padStart(2, '0');
          ctx.fill();
        }

        // Glow head
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 9);
        grd.addColorStop(0, pulse.color + 'cc');
        grd.addColorStop(1, pulse.color + '00');
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#e8f2f8'; ctx.fill();
      }

      // Draw nodes
      for (const n of nodes) {
        const pulse = 0.72 + 0.28 * Math.sin(n.pulsePhase);
        const glowR = n.radius * 5 * pulse;

        const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        grd.addColorStop(0, n.color + Math.floor(0.55 * n.brightness * pulse * 255).toString(16).padStart(2, '0'));
        grd.addColorStop(0.45, n.color + '22');
        grd.addColorStop(1, n.color + '00');
        ctx.beginPath(); ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius * pulse * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232,242,248,${0.88 * n.brightness})`;
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0,
        opacity: phase === 'done' ? 0.4 : 1, transition: 'opacity 2.2s ease' }}
    />
  );
}
