import type { CSSProperties } from 'react'
import rig from '@/lib/mascot-rig.json'

/**
 * Parts cut from the official T-pose. Pose photos are the real references
 * (wave, hands on hips, sit, jump, side walk, back) and swap in whole,
 * with no crossfade, so nothing ghosts.
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

function Part({ name, className }: { name: keyof typeof rig.layout; className: string }) {
  return (
    <span className={`vp-part ${className}`} style={place(name)}>
      <img src={`/mascot/parts/${name}.png`} alt="" draggable={false} />
    </span>
  )
}

export function VibePeepFigure() {
  return (
    <>
      <span className="vp-front">
        <Part name="leg-l" className="vp-leg vp-leg-l" />
        <Part name="leg-r" className="vp-leg vp-leg-r" />
        <Part name="body" className="vp-torso" />
        <Part name="arm-l" className="vp-arm vp-arm-l" />
        <Part name="arm-r" className="vp-arm vp-arm-r" />
        <Part name="antenna" className="vp-ant" />
      </span>
      <img className="vp-pose vp-pose-walk" src="/mascot/poses/walk.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-wave" src="/mascot/poses/wave.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-hips" src="/mascot/poses/hips.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-sit" src="/mascot/poses/sit.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-jump" src="/mascot/poses/jump.png" alt="" draggable={false} />
      <img className="vp-pose vp-pose-back" src="/mascot/poses/back.png" alt="" draggable={false} />
    </>
  )
}
