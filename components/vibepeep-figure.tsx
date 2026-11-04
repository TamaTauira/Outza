import type { CSSProperties, ReactNode } from 'react'
import rig from '@/lib/mascot-rig.json'

/**
 * Jointed figure. Every pose is this one rig, so a swap can never stack
 * two bodies. Eye whites are opaque in the art; the discs sit behind the
 * face in case a fringe pixel is still open.
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

function sideBox(left: number, top: number, width: number, height: number, originX: number, originY: number): CSSProperties {
  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
    transformOrigin: `${originX * 100}% ${originY * 100}%`,
  }
}

function Part({
  name,
  className,
  children,
}: {
  name: keyof typeof rig.layout
  className: string
  children?: ReactNode
}) {
  return (
    <span className={`vp-part ${className}`} style={place(name)}>
      <img src={`/mascot/parts/${name}.png`} alt="" draggable={false} />
      {children}
    </span>
  )
}

function Pizza() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 20c16-10 36-10 52 0L34 56 6 20z" fill="#E39A3C" />
      <path d="M12 22c12-6 28-6 40 0L34 50 12 22z" fill="#F6D56A" />
      <circle cx="24" cy="28" r="4" fill="#D64532" />
      <circle cx="36" cy="32" r="3.4" fill="#C53428" />
      <circle cx="30" cy="24" r="2.6" fill="#A82C22" />
    </svg>
  )
}

export function VibePeepFigure() {
  return (
    <>
      <span className="vp-front">
        <Part name="leg-l" className="vp-leg vp-leg-l" />
        <Part name="leg-r" className="vp-leg vp-leg-r" />
        <Part name="body" className="vp-torso" />
        <Part name="arm-l" className="vp-arm vp-arm-l">
          <img className="vp-arm-hip" src="/mascot/parts/arm-hip-l.png" alt="" draggable={false} />
          <span className="vp-prop vp-pizza" aria-hidden="true">
            <Pizza />
          </span>
        </Part>
        <Part name="arm-r" className="vp-arm vp-arm-r">
          <img className="vp-arm-hip" src="/mascot/parts/arm-hip-r.png" alt="" draggable={false} />
          <img className="vp-finger" src="/mascot/parts/arm-point-r.png" alt="" draggable={false} />
        </Part>
        <span className="vp-prop vp-snake" aria-hidden="true">
          <img src="/mascot/parts/python.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-grip vp-grip-l" style={place('arm-l')} aria-hidden="true">
          <img src="/mascot/parts/arm-l.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-grip vp-grip-r" style={place('arm-r')} aria-hidden="true">
          <img src="/mascot/parts/arm-r.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-ant" style={place('antenna')}>
          <img className="vp-ant-stalk" src="/mascot/parts/antenna-stalk.png" alt="" draggable={false} />
          <img className="vp-ant-tip" src="/mascot/parts/antenna-tip.png" alt="" draggable={false} />
        </span>
        <span className="vp-zap vp-zap-a" aria-hidden="true" />
        <span className="vp-zap vp-zap-b" aria-hidden="true" />
        <span className="vp-zap vp-zap-c" aria-hidden="true" />
      </span>
      <span className="vp-profile" aria-hidden="true">
        <span className="vp-part vp-s-leg-b" style={sideBox(0.3, 0.64, 0.32, 0.38, 0.5, 0.08)}>
          <img src="/mascot/parts/leg-side.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-s-body" style={sideBox(0.16, 0.1, 0.66, 0.7, 0.5, 0.42)}>
          <img src="/mascot/parts/body-side.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-s-leg-f" style={sideBox(0.42, 0.62, 0.34, 0.4, 0.46, 0.08)}>
          <img src="/mascot/parts/leg-side.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-s-arm-f" style={sideBox(0.46, 0.4, 0.24, 0.38, 0.5, 0.08)}>
          <img src="/mascot/parts/arm-side.png" alt="" draggable={false} />
        </span>
        <span className="vp-part vp-s-ant" style={sideBox(0.4, -0.01, 0.2, 0.2, 0.5, 1)}>
          <img className="vp-ant-stalk" src="/mascot/parts/antenna-stalk.png" alt="" draggable={false} />
          <img className="vp-ant-tip" src="/mascot/parts/antenna-tip.png" alt="" draggable={false} />
        </span>
      </span>
      <img className="vp-threeq" src="/mascot/poses/three-quarter.png" alt="" draggable={false} />
      <img className="vp-sheet vp-sheet-hips" src="/mascot/poses/sheet-hips.png" alt="" draggable={false} />
      <img className="vp-sheet vp-sheet-out" src="/mascot/poses/sheet-out.png" alt="" draggable={false} />
      <img className="vp-sheet vp-sheet-point" src="/mascot/poses/sheet-point.png" alt="" draggable={false} />
      <img className="vp-sheet vp-sheet-wave" src="/mascot/poses/sheet-wave.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-walk" src="/mascot/poses/walk.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-wave" src="/mascot/poses/wave.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-hips" src="/mascot/poses/hips.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-sit" src="/mascot/poses/sit.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-jump" src="/mascot/poses/jump.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-back" src="/mascot/poses/back.png" alt="" draggable={false} />
    </>
  )
}
