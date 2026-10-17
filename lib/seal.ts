// The wax seal outline, shared by the React components and the guest page's server HTML.

function sealPath(): string {
  const n = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 45.5 + 2.4 * Math.sin(a * 5 + 1.1) + 1.5 * Math.sin(a * 9 + 2.3) + 0.9 * Math.sin(a * 15 + 0.4);
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[0], pts[1]);
  let d = `M${m0[0].toFixed(2)} ${m0[1].toFixed(2)}`;
  for (let j = 1; j <= n; j++) {
    const p = pts[j % n];
    const m = mid(p, pts[(j + 1) % n]);
    d += ` Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)}`;
  }
  return d + "Z";
}

export const SEAL_D = sealPath();
