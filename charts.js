/* ==========================================================================
   SAPS Industries — Charts (pure Canvas 2D, zero dependencies)
   Renders: an animated line chart (Quotations vs Orders) and a donut
            chart (Paid vs Credit). HiDPI-aware and responsive.
   ========================================================================== */

(function () {
  const FONT = '12px Inter, system-ui, sans-serif';

  /* Read a CSS custom property from :root (adapts to light/dark theme). */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* Current theme-aware palette, resolved fresh on every render. */
  function palette() {
    return {
      brand:  cssVar('--primary', '#2563EB'),
      accent: cssVar('--success-500', '#16A34A'),
      grid:   cssVar('--border', '#E5E7EB'),
      axis:   cssVar('--text-faint', '#9CA3AF'),
      text:   cssVar('--text', '#111827'),
    };
  }

  /* Convert a #rgb / #rrggbb colour to an rgba() string. */
  function rgba(hex, alpha) {
    let h = (hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return 'rgba(37,99,235,' + alpha + ')';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* Prepare a canvas for crisp rendering at device pixel ratio. */
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    const rect = canvas.getBoundingClientRect();
    // Prefer the parent container size so the chart fills its card.
    const w = Math.round(parent.clientWidth || rect.width || 300);
    const h = Math.round(parent.clientHeight || rect.height || 200);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* ---------------------------------------------------------------- LINE */
  function drawLineChart(canvas) {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const quotations = [18, 24, 21, 32, 28, 38];
    const orders = [10, 14, 16, 20, 19, 27];

    const padL = 40, padR = 16, padT = 18, padB = 30;
    const maxV = 40;

    function frame(progress) {
      const { ctx, w, h } = setupCanvas(canvas);
      const pal = palette();
      const cardFill = cssVar('--card', '#FFFFFF');
      ctx.clearRect(0, 0, w, h);
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      const x = (i) => padL + (plotW * i) / (labels.length - 1);
      const y = (v) => padT + plotH - (plotH * v) / maxV;

      // Grid + y labels
      ctx.font = FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const v = (maxV / 4) * i;
        const gy = y(v);
        ctx.strokeStyle = pal.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
        ctx.fillStyle = pal.axis;
        ctx.fillText(String(v), padL - 8, gy);
      }

      // x labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      labels.forEach((lab, i) => {
        ctx.fillStyle = pal.axis;
        ctx.fillText(lab, x(i), h - padB + 8);
      });

      const series = [
        { data: quotations, color: pal.brand, fill: rgba(pal.brand, 0.14) },
        { data: orders, color: pal.accent, fill: rgba(pal.accent, 0.12) },
      ];

      series.forEach(({ data, color, fill }) => {
        // Area fill
        ctx.beginPath();
        data.forEach((v, i) => {
          const px = x(i);
          const py = y(v * progress);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.lineTo(x(data.length - 1), y(0));
        ctx.lineTo(x(0), y(0));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Line
        ctx.beginPath();
        data.forEach((v, i) => {
          const px = x(i);
          const py = y(v * progress);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Points
        data.forEach((v, i) => {
          ctx.beginPath();
          ctx.arc(x(i), y(v * progress), 3.5, 0, Math.PI * 2);
          ctx.fillStyle = cardFill;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = color;
          ctx.stroke();
        });
      });
    }

    animate(frame);
  }

  /* --------------------------------------------------------------- DONUT */
  function drawDonutChart(canvas) {
    const data = [
      { value: 68, key: 'accent' },  // Paid  → success/green
      { value: 32, key: 'brand' },   // Credit → primary
    ];
    const total = data.reduce((s, x) => s + x.value, 0);

    function frame(progress) {
      const { ctx, w, h } = setupCanvas(canvas);
      const pal = palette();
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2 - 16;
      const thickness = radius * 0.42;

      let start = -Math.PI / 2;
      data.forEach((seg) => {
        const angle = (seg.value / total) * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + angle);
        ctx.arc(cx, cy, radius - thickness, start + angle, start, true);
        ctx.closePath();
        ctx.fillStyle = pal[seg.key];
        ctx.fill();
        start += angle;
      });

      // Center label
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.text;
      ctx.font = '700 26px Inter, system-ui, sans-serif';
      ctx.fillText(Math.round(68 * progress) + '%', cx, cy - 6);
      ctx.fillStyle = pal.axis;
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText('Paid', cx, cy + 16);
    }

    animate(frame);
  }

  /* ------------------------------------------------------------ animator */
  function animate(frameFn) {
    const duration = 900;
    let startTs = null;
    function tick(ts) {
      if (!startTs) startTs = ts;
      const p = Math.min((ts - startTs) / duration, 1);
      frameFn(easeOut(p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------- init */
  function init() {
    const line = document.getElementById('lineChart');
    const donut = document.getElementById('donutChart');
    if (line) drawLineChart(line);
    if (donut) drawDonutChart(donut);
  }

  // Expose so the theme toggle can re-render charts with the new palette.
  window.renderCharts = init;

  document.addEventListener('DOMContentLoaded', init);

  // Re-render on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 200);
  });
})();
