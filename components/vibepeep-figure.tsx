import type { CSSProperties } from 'react'
import rig from '@/lib/mascot-rig.json'

/**
 * Jointed VibePeep. Front view for idle, reactions and dances.
 * Three-quarter view, facing the way he walks, for left and right travel.
 * Every limb pivots on a ball that stays tucked into the body, so a swing
 * cannot open a gap at the shoulder or the hip.
 */

type Box = { left: number; top: number; width: number; height: number; originX: number; originY: number }

function place(name: keyof typeof rig.layout): CSSProperties {
  const box = rig.layout[name] as Box
  return {
    left: `${box.left * 100}%`,
    top: `${box.top * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
    transformOrigin: `${box.originX * 100}% ${box.originY * 100}%`,
  }
}

function Gloss({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx="30%" cy="18%" r="82%">
      <stop offset="0%" stopColor="#6e6e76" />
      <stop offset="28%" stopColor="#34343c" />
      <stop offset="62%" stopColor="#222228" />
      <stop offset="100%" stopColor="#101014" />
    </radialGradient>
  )
}

function ArmLeft({ gid }: { gid: string }) {
  return (
    <svg viewBox="0 0 90 210" className="vp-limb">
      <defs><Gloss id={gid} /></defs>
      <circle cx="64" cy="22" r="18" fill={`url(#${gid})`} />
      <path d="M48 30c-8 22-10 58-4 96 2 14 14 18 26 12 12-6 16-40 12-78-2-22-14-36-26-34-3 1-6 2-8 4z" fill={`url(#${gid})`} />
      <path d="M46 128c8-5 20-3 30 6" fill="none" stroke="#0c0c10" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M47 131c8-4 18-2 28 6" fill="none" stroke="#9a9aa4" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="54" cy="172" rx="22" ry="20" fill={`url(#${gid})`} />
      <ellipse cx="72" cy="158" rx="11" ry="13" fill="#2c2c34" />
      <ellipse cx="69" cy="154" rx="5" ry="6" fill="#5a5a64" opacity="0.55" />
      <ellipse cx="44" cy="164" rx="7" ry="9" fill="#fff" opacity="0.12" />
      <ellipse cx="58" cy="14" rx="7" ry="4" fill="#fff" opacity="0.16" />
    </svg>
  )
}

function ArmRight({ gid }: { gid: string }) {
  return (
    <svg viewBox="0 0 90 210" className="vp-limb">
      <defs><Gloss id={gid} /></defs>
      <circle cx="26" cy="22" r="18" fill={`url(#${gid})`} />
      <path d="M42 30c8 22 10 58 4 96-2 14-14 18-26 12-12-6-16-40-12-78 2-22 14-36 26-34 3 1 6 2 8 4z" fill={`url(#${gid})`} />
      <path d="M44 128c-8-5-20-3-30 6" fill="none" stroke="#0c0c10" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M43 131c-8-4-18-2-28 6" fill="none" stroke="#9a9aa4" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="36" cy="172" rx="22" ry="20" fill={`url(#${gid})`} />
      <ellipse cx="18" cy="158" rx="11" ry="13" fill="#2c2c34" />
      <ellipse cx="21" cy="154" rx="5" ry="6" fill="#5a5a64" opacity="0.55" />
      <ellipse cx="30" cy="164" rx="7" ry="9" fill="#fff" opacity="0.12" />
      <ellipse cx="22" cy="14" rx="7" ry="4" fill="#fff" opacity="0.16" />
    </svg>
  )
}

function Leg({ gid, toe }: { gid: string; toe: number }) {
  return (
    <svg viewBox="0 0 100 150" className="vp-limb">
      <defs><Gloss id={gid} /></defs>
      <circle cx="50" cy="24" r="21" fill={`url(#${gid})`} />
      <path d="M32 32c-6 18-6 46-2 68 2 12 16 16 28 12 14-6 18-34 14-64-2-16-16-26-28-22-5 1-9 3-12 6z" fill={`url(#${gid})`} />
      <path d={`M${38 + toe * 0.2} 96c8-6 20-5 32 4`} fill="none" stroke="#0c0c10" strokeWidth="2.5" strokeLinecap="round" />
      <path d={`M${39 + toe * 0.2} 99c8-5 18-4 28 4`} fill="none" stroke="#9a9aa4" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <ellipse cx={50 + toe} cy="122" rx="27" ry="20" fill={`url(#${gid})`} />
      <ellipse cx={62 + toe} cy="126" rx="14" ry="11" fill="#2a2a30" />
      <ellipse cx={40 + toe} cy="116" rx="8" ry="6" fill="#fff" opacity="0.1" />
    </svg>
  )
}

function Antenna({ gid }: { gid: string }) {
  return (
    <svg viewBox="0 0 80 100" className="vp-limb">
      <defs><Gloss id={gid} /></defs>
      <circle cx="40" cy="22" r="16" fill={`url(#${gid})`} />
      <ellipse cx="34" cy="16" rx="6" ry="4" fill="#fff" opacity="0.2" />
      <path d="M40 36v48" stroke="#1a1a1e" strokeWidth="7" strokeLinecap="round" />
      <path d="M38 40v40" stroke="#4a4a52" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <circle cx="40" cy="86" r="7" fill="#2a2a30" />
    </svg>
  )
}

function Spark({ tilt }: { tilt: number }) {
  return (
    <svg viewBox="0 0 80 36" className="vp-limb">
      <g transform={`rotate(${tilt} 40 18)`}>
        <rect x="4" y="8" width="72" height="20" rx="10" fill="#FF8A1A" />
        <rect x="12" y="12" width="26" height="7" rx="3.5" fill="#fff" opacity="0.35" />
      </g>
    </svg>
  )
}

function FrontBody() {
  return (
    <svg viewBox="0 0 400 420" className="vp-limb">
      <defs>
        <radialGradient id="vp-body" cx="36%" cy="24%" r="78%">
          <stop offset="0%" stopColor="#5e5e66" />
          <stop offset="26%" stopColor="#32323a" />
          <stop offset="58%" stopColor="#1e1e24" />
          <stop offset="100%" stopColor="#101014" />
        </radialGradient>
        <linearGradient id="vp-blend" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#FF7A18" />
          <stop offset="55%" stopColor="#FF5A55" />
          <stop offset="100%" stopColor="#FF4E88" />
        </linearGradient>
        <radialGradient id="vp-eye" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f3f1ec" />
        </radialGradient>
      </defs>
      <circle cx="84" cy="178" r="20" fill="#2a2a30" />
      <circle cx="82" cy="176" r="18" fill="url(#vp-body)" />
      <circle cx="322" cy="164" r="19" fill="#2a2a30" />
      <circle cx="324" cy="162" r="17" fill="url(#vp-body)" />
      <path
        d="M200 76c92-6 150 58 138 132-12 72-42 146-138 156C104 354 70 280 62 208 50 132 108 70 200 76z"
        fill="url(#vp-body)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="3"
      />
      <ellipse cx="150" cy="118" rx="46" ry="28" fill="#fff" opacity="0.1" />
      <path d="M118 112c-16 28-18 62-4 92" fill="none" stroke="#0c0c10" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <path d="M122 110c-14 28-16 62-2 94" fill="none" stroke="#b7b7c0" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path d="M116 272c28 12 68 16 112 10 40-6 64-14 78-22" fill="none" stroke="#0c0c10" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <path d="M118 268c28 12 68 16 110 10 38-6 62-14 76-20" fill="none" stroke="#a0a0aa" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <circle cx="168" cy="176" r="54" fill="none" stroke="#FF7A18" strokeWidth="18" />
      <circle cx="256" cy="162" r="50" fill="none" stroke="#FF4E88" strokeWidth="17" />
      <ellipse cx="214" cy="170" rx="14" ry="38" fill="url(#vp-blend)" />
      <ellipse cx="172" cy="180" rx="28" ry="32" fill="url(#vp-eye)" />
      <ellipse cx="258" cy="162" rx="26" ry="30" fill="url(#vp-eye)" />
      <g className="vp-pupil vp-pupil-l">
        <circle cx="178" cy="186" r="15" fill="#141418" />
        <circle cx="172" cy="180" r="5" fill="#fff" />
      </g>
      <g className="vp-pupil vp-pupil-r">
        <circle cx="264" cy="168" r="14" fill="#141418" />
        <circle cx="258" cy="162" r="4.5" fill="#fff" />
      </g>
      <ellipse cx="176" cy="208" rx="18" ry="14" fill="#4a1830" />
      <ellipse cx="176" cy="212" rx="12" ry="8" fill="#ff8aa6" />
      <ellipse cx="170" cy="204" rx="7" ry="3.5" fill="#fff" opacity="0.45" />
    </svg>
  )
}

function TurnedBody() {
  return (
    <svg viewBox="0 0 400 420" className="vp-side-art">
      <defs>
        <radialGradient id="vp-tbody" cx="32%" cy="22%" r="80%">
          <stop offset="0%" stopColor="#5c5c64" />
          <stop offset="30%" stopColor="#303038" />
          <stop offset="70%" stopColor="#1c1c22" />
          <stop offset="100%" stopColor="#101014" />
        </radialGradient>
        <linearGradient id="vp-tblend" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF7A18" />
          <stop offset="100%" stopColor="#FF4E88" />
        </linearGradient>
        <radialGradient id="vp-teye" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f4f2ec" />
        </radialGradient>
      </defs>
      <circle cx="132" cy="176" r="17" fill="#222228" />
      <circle cx="130" cy="174" r="15" fill="url(#vp-tbody)" />
      <circle cx="302" cy="168" r="12" fill="#2a2a30" />
      <path
        d="M214 72c78 6 122 64 108 136-14 64-40 128-112 140-78-8-112-70-100-138 10-62 40-144 104-138z"
        fill="url(#vp-tbody)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="3"
      />
      <ellipse cx="168" cy="120" rx="36" ry="22" fill="#fff" opacity="0.1" />
      <path d="M146 118c-10 30-8 64 6 92" fill="none" stroke="#0c0c10" strokeWidth="2.6" strokeLinecap="round" opacity="0.5" />
      <path d="M150 116c-8 30-6 64 8 94" fill="none" stroke="#b0b0b8" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <path d="M140 276c24 14 58 18 96 12 34-6 58-16 70-24" fill="none" stroke="#0c0c10" strokeWidth="2.6" strokeLinecap="round" opacity="0.45" />
      <path d="M142 272c24 14 56 18 94 12 32-6 56-16 68-22" fill="none" stroke="#a4a4ae" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      <circle cx="186" cy="174" r="46" fill="none" stroke="#FF7A18" strokeWidth="16" />
      <circle cx="252" cy="162" r="44" fill="none" stroke="#FF4E88" strokeWidth="15" />
      <ellipse cx="218" cy="168" rx="12" ry="32" fill="url(#vp-tblend)" />
      <ellipse cx="184" cy="176" rx="22" ry="26" fill="url(#vp-teye)" />
      <ellipse cx="254" cy="164" rx="24" ry="28" fill="url(#vp-teye)" />
      <circle cx="190" cy="180" r="11" fill="#141418" />
      <circle cx="186" cy="176" r="3.5" fill="#fff" />
      <circle cx="260" cy="168" r="12" fill="#141418" />
      <circle cx="255" cy="163" r="4" fill="#fff" />
      <ellipse cx="204" cy="210" rx="13" ry="10" fill="#4a1830" />
      <ellipse cx="204" cy="213" rx="8" ry="5.5" fill="#ff8aa6" />
    </svg>
  )
}

function WalkLeg({ gid }: { gid: string }) {
  return (
    <svg viewBox="0 0 130 150" className="vp-limb">
      <defs><Gloss id={gid} /></defs>
      <circle cx="52" cy="24" r="20" fill={`url(#${gid})`} />
      <ellipse cx="58" cy="68" rx="18" ry="30" fill={`url(#${gid})`} />
      <ellipse cx="66" cy="98" rx="16" ry="20" fill={`url(#${gid})`} />
      <path d="M52 90c10-4 24-2 34 6" fill="none" stroke="#0c0c10" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M54 93c9-3 22-1 30 6" fill="none" stroke="#9a9aa4" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <ellipse cx="78" cy="120" rx="28" ry="18" fill={`url(#${gid})`} />
      <ellipse cx="102" cy="124" rx="16" ry="11" fill="#2a2a30" />
      <ellipse cx="64" cy="116" rx="10" ry="7" fill="#fff" opacity="0.1" />
    </svg>
  )
}

const walkLegOrigin = '40% 16%'

export function VibePeepFigure() {
  return (
    <>
      <span className="vp-front">
        <span className="vp-part vp-leg vp-leg-l" style={place('leg-l')}><Leg gid="vp-ll" toe={-8} /></span>
        <span className="vp-part vp-leg vp-leg-r" style={place('leg-r')}><Leg gid="vp-lr" toe={8} /></span>
        <span className="vp-part vp-torso" style={place('body')}><FrontBody /></span>
        <span className="vp-part vp-arm vp-arm-l" style={place('arm-l')}><ArmLeft gid="vp-al" /></span>
        <span className="vp-part vp-arm vp-arm-r" style={place('arm-r')}><ArmRight gid="vp-ar" /></span>
        <span className="vp-part vp-spark vp-spark-0" style={place('spark-0')}><Spark tilt={-28} /></span>
        <span className="vp-part vp-spark vp-spark-1" style={place('spark-1')}><Spark tilt={-8} /></span>
        <span className="vp-part vp-spark vp-spark-2" style={place('spark-2')}><Spark tilt={24} /></span>
        <span className="vp-part vp-spark vp-spark-3" style={place('spark-3')}><Spark tilt={12} /></span>
        <span className="vp-part vp-ant" style={place('antenna')}><Antenna gid="vp-ant-f" /></span>
      </span>
      <span className="vp-side">
        <span className="vp-part vp-s-leg vp-s-leg-b" style={{ left: '30%', top: '69%', width: '28%', height: '32%', transformOrigin: walkLegOrigin }}>
          <WalkLeg gid="vp-wlb" />
        </span>
        <span className="vp-part vp-s-arm vp-s-arm-b" style={{ left: '14%', top: '45%', width: '22%', height: '46%', transformOrigin: '71% 10.5%' }}>
          <ArmLeft gid="vp-sal" />
        </span>
        <TurnedBody />
        <span className="vp-part vp-s-leg vp-s-leg-f" style={{ left: '46%', top: '66%', width: '32%', height: '34%', transformOrigin: walkLegOrigin }}>
          <WalkLeg gid="vp-wlf" />
        </span>
        <span className="vp-part vp-s-arm vp-s-arm-f" style={{ left: '76%', top: '50%', width: '18%', height: '40%', transformOrigin: '29% 10.5%' }}>
          <ArmRight gid="vp-sar" />
        </span>
        <span className="vp-part vp-s-ant" style={{ left: '44%', top: '1.5%', width: '16%', height: '18%', transformOrigin: '50% 86%' }}>
          <Antenna gid="vp-ant-s" />
        </span>
      </span>
    </>
  )
}
