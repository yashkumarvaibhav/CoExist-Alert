/**
 * Decorative dusk scene for the landing hero: forest edge, rail crossing,
 * an elephant with a calf, and three sensor masts pulsing at the boundary.
 * Purely presentational — hidden from assistive tech, never interactive.
 * Focal cluster (crossing + elephants) sits near x 560–940 so it survives
 * the mobile center crop; the scene is bottom-anchored.
 */
export function LandingScene() {
  return (
    <div
      aria-hidden="true"
      data-testid="landing-scene"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 1440 810"
        preserveAspectRatio="xMidYMax slice"
        role="presentation"
        focusable="false"
      >
        <defs>
          <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b1315" />
            <stop offset="0.55" stopColor="#10191b" />
            <stop offset="1" stopColor="#132225" />
          </linearGradient>
          <radialGradient id="ls-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#66dcd5" stopOpacity="0.22" />
            <stop offset="1" stopColor="#66dcd5" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1440" height="810" fill="url(#ls-sky)" />
        <ellipse cx="840" cy="560" rx="560" ry="210" fill="url(#ls-glow)" />
        <ellipse cx="860" cy="520" rx="330" ry="150" fill="url(#ls-glow)" />

        <g fill="#bfeeea">
          <circle cx="140" cy="90" r="1.6" opacity="0.3" />
          <circle cx="340" cy="150" r="1.2" opacity="0.22" className="scene-twinkle" />
          <circle cx="520" cy="70" r="1.4" opacity="0.26" />
          <circle
            cx="705"
            cy="130"
            r="1.1"
            opacity="0.2"
            className="scene-twinkle"
            style={{ animationDelay: "3s" }}
          />
          <circle cx="880" cy="60" r="1.5" opacity="0.3" />
          <circle
            cx="1050"
            cy="120"
            r="1.2"
            opacity="0.22"
            className="scene-twinkle"
            style={{ animationDelay: "5.5s" }}
          />
          <circle cx="1220" cy="80" r="1.6" opacity="0.28" />
          <circle cx="1330" cy="170" r="1.1" opacity="0.2" />
          <circle cx="240" cy="220" r="1.1" opacity="0.18" />
          <circle cx="990" cy="200" r="1.2" opacity="0.2" />
        </g>

        {/* far ridge */}
        <path
          d="M0 505 C 130 480 260 492 380 472 C 520 450 640 486 780 470 C 930 452 1060 488 1190 470 C 1300 456 1380 472 1440 462 L1440 810 L0 810 Z"
          fill="#152326"
        />

        {/* treeline, receding around the clearing at the crossing */}
        <path
          d="M0 560 C 40 545 70 522 110 528 C 150 534 175 508 215 516 C 250 522 275 540 320 536 C 360 532 385 505 430 514 C 470 521 500 542 545 538 C 585 534 610 512 655 522 C 690 529 715 549 760 552 C 800 555 850 558 900 556 C 950 554 1000 549 1040 540 C 1080 531 1105 508 1150 516 C 1190 523 1215 541 1260 536 C 1300 531 1330 508 1375 518 C 1405 524 1425 538 1440 534 L1440 810 L0 810 Z"
          fill="#0e181a"
        />
        <g fill="#0d1719">
          <ellipse cx="176" cy="470" rx="26" ry="20" />
          <rect x="173" y="486" width="6" height="36" />
          <ellipse cx="1112" cy="466" rx="30" ry="22" />
          <rect x="1109" y="484" width="6" height="40" />
        </g>

        {/* ground */}
        <path
          d="M0 620 C 220 610 420 616 640 610 C 900 602 1160 610 1440 604 L1440 810 L0 810 Z"
          fill="#0a1214"
        />
        <ellipse cx="1205" cy="650" rx="72" ry="12" fill="#0f2427" />

        {/* rail line into the crossing */}
        <g stroke="#8fa3a5" fill="none">
          <g strokeOpacity="0.08" strokeWidth="3">
            <path d="M130 752 L 405 752" />
            <path d="M330 700 L 525 700" />
            <path d="M485 660 L 615 660" />
            <path d="M588 634 L 673 634" />
            <path d="M660 616 L 713 616" />
          </g>
          <path d="M-80 810 L 736 598" strokeOpacity="0.14" strokeWidth="4" />
          <path d="M260 810 L 748 598" strokeOpacity="0.14" strokeWidth="4" />
        </g>

        {/* hamlet at the boundary */}
        <g fill="#132124">
          <path d="M80 622 L80 596 L108 578 L136 596 L136 622 Z" />
          <path d="M150 620 L150 600 L172 586 L194 600 L194 620 Z" />
          <path d="M215 624 L215 602 L241 586 L267 602 L267 624 Z" />
        </g>
        <rect x="167" y="604" width="7" height="9" fill="#66dcd5" opacity="0.5" />

        {/* elephant and calf approaching the crossing */}
        <g fill="#070d0e">
          <g transform="translate(820 482)">
            <ellipse cx="92" cy="44" rx="84" ry="42" />
            <circle cx="6" cy="26" r="33" />
            <path d="M18 0 C 46 4 54 36 36 54 C 22 64 6 58 4 40 Z" />
            <path d="M-20 16 C -38 34 -36 62 -44 86 C -47 98 -38 103 -32 94 C -22 74 -24 48 -14 32 Z" />
            <rect x="26" y="66" width="17" height="56" rx="8" />
            <rect x="60" y="74" width="16" height="48" rx="8" />
            <rect x="116" y="74" width="16" height="48" rx="8" />
            <rect x="150" y="66" width="17" height="56" rx="8" />
            <path d="M172 26 C 186 42 184 66 175 82 L 168 79 C 176 64 176 46 164 34 Z" />
          </g>
          <g transform="translate(645 558) scale(0.4)">
            <ellipse cx="92" cy="44" rx="84" ry="42" />
            <circle cx="6" cy="26" r="33" />
            <path d="M18 0 C 46 4 54 36 36 54 C 22 64 6 58 4 40 Z" />
            <path d="M-20 16 C -38 34 -36 62 -44 86 C -47 98 -38 103 -32 94 C -22 74 -24 48 -14 32 Z" />
            <rect x="26" y="66" width="17" height="56" rx="8" />
            <rect x="60" y="74" width="16" height="48" rx="8" />
            <rect x="116" y="74" width="16" height="48" rx="8" />
            <rect x="150" y="66" width="17" height="56" rx="8" />
            <path d="M172 26 C 186 42 184 66 175 82 L 168 79 C 176 64 176 46 164 34 Z" />
          </g>
        </g>

        {/* sensor masts: village boundary, rail crossing, waterhole */}
        <g>
          <line x1="340" y1="612" x2="340" y2="520" stroke="#3f5457" strokeWidth="3" />
          <circle cx="340" cy="514" r="16" fill="#66dcd5" opacity="0.12" />
          <rect
            x="334"
            y="508"
            width="12"
            height="12"
            transform="rotate(45 340 514)"
            fill="#66dcd5"
            opacity="0.9"
          />
          <circle cx="340" cy="514" r="26" stroke="#66dcd5" strokeWidth="1.5" fill="none" className="scene-pulse" />
          <circle
            cx="340"
            cy="514"
            r="26"
            stroke="#66dcd5"
            strokeWidth="1.5"
            fill="none"
            className="scene-pulse"
            style={{ animationDelay: "3.2s" }}
          />
        </g>
        <g>
          <line x1="742" y1="606" x2="742" y2="514" stroke="#3f5457" strokeWidth="3" />
          <circle cx="742" cy="508" r="16" fill="#66dcd5" opacity="0.14" />
          <rect
            x="736"
            y="502"
            width="12"
            height="12"
            transform="rotate(45 742 508)"
            fill="#66dcd5"
            opacity="0.95"
          />
          <circle cx="742" cy="508" r="34" stroke="#66dcd5" strokeWidth="1.5" fill="none" className="scene-pulse" />
          <circle
            cx="742"
            cy="508"
            r="34"
            stroke="#66dcd5"
            strokeWidth="1.5"
            fill="none"
            className="scene-pulse"
            style={{ animationDelay: "2.2s" }}
          />
          <circle
            cx="742"
            cy="508"
            r="34"
            stroke="#66dcd5"
            strokeWidth="1.5"
            fill="none"
            className="scene-pulse"
            style={{ animationDelay: "4.4s" }}
          />
        </g>
        <g>
          <line x1="1150" y1="606" x2="1150" y2="520" stroke="#3f5457" strokeWidth="3" />
          <circle cx="1150" cy="514" r="16" fill="#66dcd5" opacity="0.12" />
          <rect
            x="1144"
            y="508"
            width="12"
            height="12"
            transform="rotate(45 1150 514)"
            fill="#66dcd5"
            opacity="0.9"
          />
          <circle cx="1150" cy="514" r="26" stroke="#66dcd5" strokeWidth="1.5" fill="none" className="scene-pulse" />
          <circle
            cx="1150"
            cy="514"
            r="26"
            stroke="#66dcd5"
            strokeWidth="1.5"
            fill="none"
            className="scene-pulse"
            style={{ animationDelay: "3.9s" }}
          />
        </g>

        {/* alert paths fanning out from the crossing */}
        <g stroke="#66dcd5" strokeOpacity="0.45" strokeWidth="1.5" fill="none" strokeDasharray="4 10">
          <path d="M742 508 C 640 436 452 438 344 512" className="scene-dash" />
          <path
            d="M742 508 C 850 438 1042 440 1146 512"
            className="scene-dash"
            style={{ animationDelay: "1.6s" }}
          />
        </g>
      </svg>
    </div>
  );
}
