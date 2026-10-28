import type { ReactNode } from 'react';
import type { AppTab } from '@/state/ui-store';

function gearPath(teeth: number, ro: number, ri: number) {
  const st = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * st;
    for (const [g, r] of [
      [a - st * 0.5, ri],
      [a - st * 0.2, ri],
      [a - st * 0.11, ro],
      [a + st * 0.11, ro],
      [a + st * 0.2, ri],
    ] as const)
      pts.push(`${(12 + Math.cos(g) * r).toFixed(2)} ${(12 + Math.sin(g) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

interface Icon {
  body: ReactNode;
  detail?: ReactNode;
}

const ICONS: Record<AppTab, Icon> = {
  dashboard: {
    body: <circle cx="12" cy="12" r="8.5" />,
    detail: (
      <>
        <path d="M12 12.5 15.5 8.5" />
        <path d="M7.5 15.5h9" />
      </>
    ),
  },
  workbench: {
    body: (
      <>
        <rect x="3" y="4" width="18" height="12.5" rx="3" />
        <path className="ni-stay" d="M12 16.5V20M8.5 20h7" />
      </>
    ),
    detail: <path d="m7.5 8.5 2.5 2-2.5 2M13 12.5h3.5" />,
  },
  tools: {
    body: <path d="M4.5 8.5h4a2.6 2.6 0 1 1 5.2 0h3.8v3.6a2.6 2.6 0 1 1 0 5.2v3.2h-13z" />,
  },
  memory: {
    body: <path d="M7 4.5h10l4 5L12 20 3 9.5z" />,
    detail: <path d="M3 9.5h18M9.6 4.5 8 9.5l4 10.5M14.4 4.5 16 9.5 12 20" />,
  },
  conversations: {
    body: (
      <path d="M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-7L7 21v-3.5H5.5A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5z" />
    ),
    detail: <path d="M7.5 9h9M7.5 13h5.5" />,
  },
  settings: {
    body: <path d={gearPath(8, 9.5, 7.2)} />,
    detail: <circle className="ni-hole" cx="12" cy="12" r="3" />,
  },
};

export function NavIcon({ tab }: { tab: AppTab }) {
  const { body, detail } = ICONS[tab];
  return (
    <svg className="ni" viewBox="0 0 24 24" aria-hidden="true">
      <g className="ni-fill">{body}</g>
      <g className="ni-line">{body}</g>
      {detail && <g className="ni-det">{detail}</g>}
    </svg>
  );
}
