// Rodzaje zajęć: krótka nazwa, ikona i kolor (klasa kind-<klucz>, kolory w styles.css dla obu wyglądów).
// Klucz wyznaczamy z pełnej nazwy w danych. Zajęcia spoza listy dostają neutralny kafelek –
// nowe zajęcia w kolejnych miesiącach nie mogą zepsuć strony.
import { activityKey } from "./selection";

export type KindKey = "rob" | "kor" | "tus" | "slo" | "spr" | "art" | "pre" | "sen" | "other";

interface Kind {
  key: Exclude<KindKey, "other">;
  /** Dopasowanie do znormalizowanej nazwy (bez polskich znaków i wielkości liter). */
  match: RegExp;
  short: string;
  /** Jeszcze krótsza nazwa – do legendy i etykiet w kalendarzu. */
  tiny: string;
}

const KINDS: Kind[] = [
  { key: "rob", match: /robotyk|programowan/, short: "Robotyka i programowanie", tiny: "Robotyka" },
  { key: "kor", match: /korekcyjn/, short: "Zajęcia korekcyjno-kompensacyjne", tiny: "Korekcyjne" },
  { key: "tus", match: /(^| )tus( |$)/, short: "TUS – kompetencje emocjonalno-społeczne", tiny: "TUS" },
  { key: "slo", match: /slowik/, short: "Słowiki – śpiew i rytm", tiny: "Słowiki" },
  { key: "spr", match: /sprawnosciow/, short: "Zajęcia sprawnościowo-zdrowotne", tiny: "Sprawnościowe" },
  { key: "art", match: /mali artysci/, short: "Mali Artyści", tiny: "Mali Artyści" },
  { key: "pre", match: /preorientac/, short: "Preorientacja zawodowa", tiny: "Preorientacja" },
  { key: "sen", match: /sensoplast/, short: "Ruch i sensoplastyka", tiny: "Sensoplastyka" },
];

export const KNOWN_KINDS = KINDS.map((k) => ({ key: k.key, tiny: k.tiny }));

export function kindOf(activity: string): KindKey {
  const key = activityKey(activity);
  return KINDS.find((k) => k.match.test(key))?.key ?? "other";
}

/** Krótka nazwa na kartę; pełna oficjalna nazwa zostaje w szczegółach i w podpowiedzi. */
export function shortName(activity: string): string {
  const kind = KINDS.find((k) => k.key === kindOf(activity));
  return kind?.short ?? activity.replace(/^Zajęcia\s+(?=[A-ZŁŚŻŹ])/u, "");
}

export function tinyName(activity: string): string {
  const kind = KINDS.find((k) => k.key === kindOf(activity));
  return kind?.tiny ?? shortName(activity);
}

/** Ikony z makiet: obrys 1.8, kolor z currentColor. */
export function KindIcon({ kind, size = 18 }: { kind: KindKey; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "aria-hidden": true } as const;
  switch (kind) {
    case "rob":
      return (
        <svg {...common} stroke-linecap="round">
          <rect x="5" y="8" width="14" height="11" rx="3" />
          <path d="M12 4v4M9.5 13h.01M14.5 13h.01M9.5 16h5" />
        </svg>
      );
    case "kor":
      return (
        <svg {...common} stroke-linejoin="round">
          <path d="M5 9h3.5a2 2 0 114 0H16v3.5a2 2 0 110 4V20H5z" />
        </svg>
      );
    case "tus":
      return (
        <svg {...common} stroke-linejoin="round">
          <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
        </svg>
      );
    case "slo":
      return (
        <svg {...common} stroke-linecap="round">
          <path d="M9 18V6l10-2v12" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="16" r="2" />
        </svg>
      );
    case "spr":
      return (
        <svg {...common} stroke-linecap="round">
          <circle cx="12" cy="12" r="8" />
          <path d="M4.5 9.5c4 1 11 1 15 0M4.5 14.5c4-1 11-1 15 0" />
        </svg>
      );
    case "art":
      return <PaletteIcon size={size} />;
    case "pre":
      return (
        <svg {...common} stroke-linecap="round">
          <rect x="4" y="8" width="16" height="11" rx="2" />
          <path d="M9 8V6a1 1 0 011-1h4a1 1 0 011 1v2M4 13h16" />
        </svg>
      );
    case "sen":
      return (
        <svg {...common} stroke-linejoin="round">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <path d="M18 16v4M16 18h4" />
        </svg>
      );
    default:
      return (
        <svg {...common} stroke-linecap="round">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      );
  }
}

export function PaletteIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M12 4a8 8 0 100 16c1.2 0 1.6-1 1-2s0-2 1.5-2H17a3 3 0 003-3c0-5-3.6-9-8-9z" />
      <circle cx="8.5" cy="11" r=".7" />
      <circle cx="12" cy="8" r=".7" />
      <circle cx="15.5" cy="11" r=".7" />
    </svg>
  );
}

/** Logo: liniowa głowa wilczka. */
export function WolfLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M5 10V3.5l4.5 3.5h5L19 3.5V10c0 4.6-3.1 8.4-7 10-3.9-1.6-7-5.4-7-10z" stroke-linejoin="round" />
      <path d="M9.2 11.5h.01M14.8 11.5h.01" stroke-width="2.6" />
      <path d="M10.6 15.2h2.8L12 16.8z" stroke-linejoin="round" />
    </svg>
  );
}

/** Chorągiewka – wydarzenie w grupie. */
export function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

export function StarIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return filled ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export function AddToCalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
    </svg>
  );
}

export function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

export function MegaphoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9v6h3l6 4V5L7 9z" />
      <path d="M17 9a4 4 0 010 6" />
    </svg>
  );
}

export function WarnIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}

export function CancelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}

const CHEVRON = { left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6", up: "M6 15l6-6 6 6", down: "M6 9l6 6 6-6" };

export function ChevronIcon({ dir }: { dir: keyof typeof CHEVRON }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d={CHEVRON[dir]} />
    </svg>
  );
}

export function InfoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
