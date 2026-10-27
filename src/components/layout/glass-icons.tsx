import type { ReactElement } from 'react';
import type { AppTab } from '@/state/ui-store';

export const glassTone: Record<AppTab, string> = {
  dashboard: '#ff9f5a',
  workbench: '#4f8fff',
  tools: '#4fc7b8',
  memory: '#9d8cff',
  conversations: '#b9dc4c',
  settings: '#a8a8b0',
};

export const glassIcon: Record<AppTab, ReactElement> = {
  dashboard: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-dashboard-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffd0a3" />
          <stop offset=".45" stopColor="#ff9f5a" />
          <stop offset="1" stopColor="#e85d22" />
        </linearGradient>
        <linearGradient id="gl-dashboard-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#ffd0a3" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff9f5a" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-dashboard-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-dashboard-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd0a3" />
          <stop offset="1" stopColor="#ff9f5a" />
        </linearGradient>
        <linearGradient id="gl-dashboard-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-dashboard-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-dashboard-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#8a3a10" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-dashboard-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#8a3a10" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-dashboard-c">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </clipPath>
        <g id="gl-dashboard-k">
          <circle cx="60" cy="34" r="29" fill="url(#gl-dashboard-b)" />
          <path
            d="M60 14a20 20 0 0 1 19 14"
            fill="none"
            stroke="#fff"
            strokeOpacity=".42"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-dashboard-k" filter="url(#gl-dashboard-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-dashboard-fg)">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </g>
        <g clipPath="url(#gl-dashboard-c)">
          <use href="#gl-dashboard-k" filter="url(#gl-dashboard-fb)" />
          <rect width="96" height="96" fill="url(#gl-dashboard-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-dashboard-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-dashboard-s)" strokeWidth="1.4">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </g>
        <g className="gl-g">
          <path
            d="M16 74l8-9 7 5 9-12 8 7"
            fill="none"
            stroke="#fff"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-dashboard-d)" className="gl-d" />
    </svg>
  ),
  workbench: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-workbench-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#9ccdff" />
          <stop offset=".45" stopColor="#4f8fff" />
          <stop offset="1" stopColor="#1f50d6" />
        </linearGradient>
        <linearGradient id="gl-workbench-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#9ccdff" stopOpacity=".5" />
          <stop offset="1" stopColor="#4f8fff" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-workbench-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-workbench-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9ccdff" />
          <stop offset="1" stopColor="#4f8fff" />
        </linearGradient>
        <linearGradient id="gl-workbench-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-workbench-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-workbench-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#1d3f9a" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-workbench-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#1d3f9a" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-workbench-c">
          <circle cx="38" cy="60" r="27" />
        </clipPath>
        <g id="gl-workbench-k">
          <rect x="34" y="6" width="54" height="62" rx="13" fill="url(#gl-workbench-b)" />
          <rect x="44" y="15" width="15" height="15" rx="4" fill="#fff" fillOpacity=".42" />
          <rect x="64" y="15" width="15" height="15" rx="4" fill="#fff" fillOpacity=".42" />
          <rect x="64" y="36" width="15" height="15" rx="4" fill="#fff" fillOpacity=".42" />
          <rect x="44" y="36" width="15" height="15" rx="4" fill="#fff" fillOpacity=".42" />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-workbench-k" filter="url(#gl-workbench-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-workbench-fg)">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g clipPath="url(#gl-workbench-c)">
          <use href="#gl-workbench-k" filter="url(#gl-workbench-fb)" />
          <rect width="96" height="96" fill="url(#gl-workbench-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-workbench-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-workbench-s)" strokeWidth="1.4">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g className="gl-g">
          <path
            d="M33 49v22l17-11z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-workbench-d)" className="gl-d" />
    </svg>
  ),
  tools: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-tools-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a6eee4" />
          <stop offset=".45" stopColor="#4fc7b8" />
          <stop offset="1" stopColor="#108a7a" />
        </linearGradient>
        <linearGradient id="gl-tools-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#a6eee4" stopOpacity=".5" />
          <stop offset="1" stopColor="#4fc7b8" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-tools-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-tools-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a6eee4" />
          <stop offset="1" stopColor="#4fc7b8" />
        </linearGradient>
        <linearGradient id="gl-tools-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-tools-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-tools-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#0a5249" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-tools-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#0a5249" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-tools-c">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </clipPath>
        <g id="gl-tools-k">
          <polygon
            points="62.0,4.0 88.0,19.0 88.0,49.0 62.0,64.0 36.0,49.0 36.0,19.0"
            fill="url(#gl-tools-b)"
          />
          <polygon
            points="62.0,22.0 72.4,28.0 72.4,40.0 62.0,46.0 51.6,40.0 51.6,28.0"
            fill="#fff"
            fillOpacity=".42"
          />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-tools-k" filter="url(#gl-tools-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-tools-fg)">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </g>
        <g clipPath="url(#gl-tools-c)">
          <use href="#gl-tools-k" filter="url(#gl-tools-fb)" />
          <rect width="96" height="96" fill="url(#gl-tools-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-tools-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-tools-s)" strokeWidth="1.4">
          <rect x="6" y="44" width="52" height="42" rx="15" />
        </g>
        <g className="gl-g">
          <path
            d="M25 52v7M39 52v7M21 59h22v3a11 11 0 0 1-22 0zM32 73v6"
            fill="none"
            stroke="#fff"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-tools-d)" className="gl-d" />
    </svg>
  ),
  memory: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-memory-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#cfc6ff" />
          <stop offset=".45" stopColor="#9d8cff" />
          <stop offset="1" stopColor="#5a49d6" />
        </linearGradient>
        <linearGradient id="gl-memory-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#cfc6ff" stopOpacity=".5" />
          <stop offset="1" stopColor="#9d8cff" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-memory-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-memory-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cfc6ff" />
          <stop offset="1" stopColor="#9d8cff" />
        </linearGradient>
        <linearGradient id="gl-memory-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-memory-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-memory-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#3a2d9a" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-memory-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#3a2d9a" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-memory-c">
          <circle cx="38" cy="60" r="27" />
        </clipPath>
        <g id="gl-memory-k">
          <path
            d="M42 58a16 16 0 0 1 3-31 20 20 0 0 1 38 6 13 13 0 0 1 2 25z"
            fill="url(#gl-memory-b)"
          />
          <rect x="50" y="42" width="26" height="5" rx="2.5" fill="#fff" fillOpacity=".42" />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-memory-k" filter="url(#gl-memory-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-memory-fg)">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g clipPath="url(#gl-memory-c)">
          <use href="#gl-memory-k" filter="url(#gl-memory-fb)" />
          <rect width="96" height="96" fill="url(#gl-memory-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-memory-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-memory-s)" strokeWidth="1.4">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g className="gl-g">
          <path
            d="M38 47a9 9 0 0 0-5 16.5V67h10v-3.5A9 9 0 0 0 38 47z"
            fill="#fff"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="M34 73h8"
            fill="none"
            stroke="#fff"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-memory-d)" className="gl-d" />
    </svg>
  ),
  conversations: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-conversations-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#e3f59f" />
          <stop offset=".45" stopColor="#b9dc4c" />
          <stop offset="1" stopColor="#6b9612" />
        </linearGradient>
        <linearGradient id="gl-conversations-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#e3f59f" stopOpacity=".5" />
          <stop offset="1" stopColor="#b9dc4c" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-conversations-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-conversations-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3f59f" />
          <stop offset="1" stopColor="#b9dc4c" />
        </linearGradient>
        <linearGradient id="gl-conversations-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-conversations-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-conversations-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#3f5a08" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-conversations-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#3f5a08" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-conversations-c">
          <path d="M20 44h30a14 14 0 0 1 14 14v6a14 14 0 0 1-14 14H30l-12 9v-9a14 14 0 0 1-12-14v-6a14 14 0 0 1 14-14z" />
        </clipPath>
        <g id="gl-conversations-k">
          <path
            d="M46 6h30a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12h-4v10l-12-10H46a12 12 0 0 1-12-12V18a12 12 0 0 1 12-12z"
            fill="url(#gl-conversations-b)"
          />
          <rect x="46" y="18" width="28" height="5" rx="2.5" fill="#fff" fillOpacity=".42" />
          <rect x="46" y="29" width="18" height="5" rx="2.5" fill="#fff" fillOpacity=".42" />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-conversations-k" filter="url(#gl-conversations-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-conversations-fg)">
          <path d="M20 44h30a14 14 0 0 1 14 14v6a14 14 0 0 1-14 14H30l-12 9v-9a14 14 0 0 1-12-14v-6a14 14 0 0 1 14-14z" />
        </g>
        <g clipPath="url(#gl-conversations-c)">
          <use href="#gl-conversations-k" filter="url(#gl-conversations-fb)" />
          <rect width="96" height="96" fill="url(#gl-conversations-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-conversations-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-conversations-s)" strokeWidth="1.4">
          <path d="M20 44h30a14 14 0 0 1 14 14v6a14 14 0 0 1-14 14H30l-12 9v-9a14 14 0 0 1-12-14v-6a14 14 0 0 1 14-14z" />
        </g>
        <g className="gl-g">
          <circle cx="24" cy="61" r="3.6" fill="#fff" />
          <circle cx="35" cy="61" r="3.6" fill="#fff" />
          <circle cx="46" cy="61" r="3.6" fill="#fff" />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-conversations-d)" className="gl-d" />
    </svg>
  ),
  settings: (
    <svg className="gl" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="gl-settings-b"
          x1="88"
          y1="6"
          x2="30"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#e6e6ea" />
          <stop offset=".45" stopColor="#a8a8b0" />
          <stop offset="1" stopColor="#62626b" />
        </linearGradient>
        <linearGradient id="gl-settings-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".78" />
          <stop offset=".5" stopColor="#e6e6ea" stopOpacity=".5" />
          <stop offset="1" stopColor="#a8a8b0" stopOpacity=".42" />
        </linearGradient>
        <linearGradient id="gl-settings-s" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity=".1" />
        </linearGradient>
        <linearGradient id="gl-settings-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6e6ea" />
          <stop offset="1" stopColor="#a8a8b0" />
        </linearGradient>
        <linearGradient id="gl-settings-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="gl-settings-fb" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="gl-settings-fs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b" />
          <feOffset in="b" dy="3" result="o" />
          <feFlood floodColor="#34343a" floodOpacity=".3" />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gl-settings-fg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b" />
          <feOffset in="b" dy="2" result="o" />
          <feFlood floodColor="#34343a" floodOpacity=".18" />
          <feComposite in2="o" operator="in" />
        </filter>
        <clipPath id="gl-settings-c">
          <circle cx="38" cy="60" r="27" />
        </clipPath>
        <g id="gl-settings-k">
          <polygon
            points="60.0,4.0 65.9,4.6 68.4,13.7 72.2,15.7 81.2,12.8 84.9,17.3 80.3,25.6 81.6,29.7 90.0,34.0 89.4,39.9 80.3,42.4 78.3,46.2 81.2,55.2 76.7,58.9 68.4,54.3 64.3,55.6 60.0,64.0 54.1,63.4 51.6,54.3 47.8,52.3 38.8,55.2 35.1,50.7 39.7,42.4 38.4,38.3 30.0,34.0 30.6,28.1 39.7,25.6 41.7,21.8 38.8,12.8 43.3,9.1 51.6,13.7 55.7,12.4"
            strokeLinejoin="round"
            fill="url(#gl-settings-b)"
          />
          <circle cx="60" cy="34" r="9" fill="#fff" fillOpacity=".42" />
        </g>
      </defs>
      <g className="gl-b">
        <use href="#gl-settings-k" filter="url(#gl-settings-fs)" />
      </g>
      <g className="gl-f">
        <g filter="url(#gl-settings-fg)">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g clipPath="url(#gl-settings-c)">
          <use href="#gl-settings-k" filter="url(#gl-settings-fb)" />
          <rect width="96" height="96" fill="url(#gl-settings-g)" />
          <rect
            className="gl-sh"
            x="-60"
            y="0"
            width="40"
            height="96"
            fill="url(#gl-settings-h)"
            transform="skewX(-18)"
          />
        </g>
        <g fill="none" stroke="url(#gl-settings-s)" strokeWidth="1.4">
          <circle cx="38" cy="60" r="27" />
        </g>
        <g className="gl-g">
          <path
            d="M25 60h26"
            fill="none"
            stroke="#fff"
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="43" cy="60" r="6" fill="#fff" />
        </g>
      </g>
      <circle cx="86" cy="84" r="5" fill="url(#gl-settings-d)" className="gl-d" />
    </svg>
  ),
};
