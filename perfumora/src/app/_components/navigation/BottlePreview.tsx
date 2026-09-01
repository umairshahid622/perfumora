/**
 * Flat front-elevation artwork of the product bottle for the Fragrances mega-menu:
 * glass, collar and overcap drawn once, with a single liquid region that re-tints
 * per hovered/selected variant. Deliberately stylised line-art — not the photoreal
 * 3D Hero bottle — so the menu stays free of a second WebGL context.
 *
 * The paths are authored artwork (viewBox 264 × 510, y-down). Only the liquid's
 * `fill` is dynamic; everything else is fixed. Sizing comes from `className` — the
 * caller sets the box and `viewBox` scales the drawing into it.
 */

/**
 * Overcap tones. The artwork ships the cap as pure black, which all but disappears
 * on the panel's `--bg-dark` (#0b0b0c); these sit a few steps above it, with the
 * top plate lighter as the face that catches light, plus the artwork's own hairline
 * edge (#B8B5B0) so the silhouette reads.
 */
const CAP_FILL = "#2b2b31";
const CAP_TOP_FILL = "#3b3b43";
const EDGE = "#B8B5B0";

interface BottlePreviewProps {
  /**
   * Fill for the liquid region. Pass a `juiceColor(variant.hex)` result (not the
   * raw hex) so the near-clear SKUs read as a tint and agree with the 3D bottle.
   */
  liquidColor: string;
  className?: string;
}

export function BottlePreview({ liquidColor, className }: BottlePreviewProps) {
  const fillOpacity = 0.5; // glass: white at half strength over the dark panel
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 264 510"
      fill="none"
      className={className}
    >
      <rect
        x="41.5"
        y="178.5"
        width="181"
        height="17"
        rx="8.5"
        fill="white"
        fillOpacity={fillOpacity}
        stroke={EDGE}
      />
      <path
        d="M40 214.75H224C235.736 214.75 245.25 224.264 245.25 236V484C245.25 496.841 234.841 507.25 222 507.25H42C29.1594 507.25 18.75 496.841 18.75 484V236C18.75 224.264 28.2639 214.75 40 214.75Z"
        fill="white"
        fillOpacity={fillOpacity}
        stroke={EDGE}
        strokeWidth="1.5"
      />
      <path
        d="M54.5 196H208L220 214H43L54.5 196Z"
        fill="white"
        fillOpacity={fillOpacity}
      />
      <path
        d="M218.45 213.626L213.725 204.813L209 196"
        stroke={EDGE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M44 213.382L48.9466 204.691L53.8932 196"
        stroke={EDGE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Fragrance — cross-fades as the previewed variant changes. */}
      <path
        d="M26 293C26 288.582 29.5817 285 34 285H230C234.418 285 238 288.582 238 293V425C238 458.137 211.137 485 178 485H86C52.8629 485 26 458.137 26 425V293Z"
        fill={liquidColor}
        className="transition-[fill] duration-300 ease-out motion-reduce:transition-none"
      />
      <path
        d="M70.6111 97H193.389V178H70.6111V97Z"
        fill="white"
        fillOpacity={fillOpacity}
      />
      <path
        d="M193.389 97H192.889V178H193.389H193.889V97H193.389ZM70.6111 178H71.1111V97H70.6111H70.1111V178H70.6111Z"
        fill={EDGE}
      />
      <rect
        x="57.5"
        y="78.5"
        width="149"
        height="18"
        rx="3.5"
        fill="white"
        fillOpacity={fillOpacity}
        stroke={EDGE}
      />
      <path
        d="M80 47.6803C80 44.9188 82.2386 42.6803 85 42.6803H179C181.761 42.6803 184 44.9189 184 47.6803V164.488C184 166.144 182.657 167.488 181 167.488H83C81.3431 167.488 80 166.144 80 164.488V47.6803Z"
        fill={CAP_FILL}
        stroke={EDGE}
        strokeOpacity={0.3}
        strokeWidth="1.5"
      />
      <rect
        x="57"
        y="38"
        width="150"
        height="19"
        rx="4"
        fill={CAP_TOP_FILL}
        stroke={EDGE}
        strokeOpacity={0.3}
        strokeWidth="1.5"
      />
    </svg>
  );
}
