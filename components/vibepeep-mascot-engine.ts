import {
  HOVER_LINES,
  HOVER_POOL,
  PARTY_LINE,
  PARTY_MS,
  REACTION_LINES,
  REACTION_MS,
  isPartyCombo,
  pickReaction,
  type ReactionId,
} from '@/lib/mascot-reactions'

const WINDOW_MS = 2000
const COLORS = ['#FF8A1A', '#FF4E6A', '#FFD166', '#FFFFFF', '#7CFFCB', '#8AB4FF']

type PlayId = ReactionId | 'party'

function spawnBits(fx: HTMLElement, id: PlayId) {
  fx.replaceChildren()
  const hearts = id === 'hearts' || id === 'heart-eyes' || id === 'party'
  const confetti = id === 'confetti' || id === 'party'
  const spark = id === 'wink' || id === 'rainbow' || id === 'eyepop'
  const heartCount = hearts ? (id === 'party' ? 6 : 7) : 0
  const confettiCount = confetti ? (id === 'party' ? 10 : 12) : 0
  const sparkCount = spark ? 5 : 0
  const total = heartCount + confettiCount + sparkCount
  for (let i = 0; i < total; i++) {
    const el = document.createElement('i')
    const kind = i < heartCount ? 'heart' : i < heartCount + sparkCount ? 'spark' : 'confetti'
    el.className = kind === 'confetti' ? 'vp-bit' : `vp-bit vp-bit-${kind}`
    if (kind === 'heart') el.textContent = '♥'
    if (kind === 'spark') el.textContent = '✦'
    const angle = (Math.PI * 2 * i) / Math.max(total, 1) - Math.PI / 2
    const dist = 34 + (i % 4) * 14
    el.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}%`)
    el.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist - (kind === 'heart' ? 30 : 6))}%`)
    el.style.setProperty('--rot', `${(i * 47) % 200 - 80}deg`)
    el.style.setProperty('--delay', `${(i % 6) * 0.045}s`)
    el.style.color = i % 2 ? '#FF4E6A' : '#FF8A1A'
    if (kind === 'spark') el.style.color = '#FFD166'
    if (kind === 'confetti') {
      el.style.background = COLORS[i % COLORS.length]
      if (i % 3 === 0) el.style.borderRadius = '999px'
    }
    fx.appendChild(el)
  }
}

export function attachMascot(slot: HTMLElement): () => void {
  const button = slot.querySelector<HTMLButtonElement>('.vp-hit')
  const fx = slot.querySelector<HTMLElement>('.vp-fx')
  const bubble = slot.querySelector<HTMLElement>('.vp-bubble')
  const live = slot.querySelector<HTMLElement>('.vp-live')
  if (!button || !fx || !bubble || !live) return () => {}

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const fineMq = window.matchMedia('(pointer: fine)')
  let reduce = reduceMq.matches
  let fine = fineMq.matches
  let reaction: PlayId | null = null
  let last: PlayId | null = null
  let stamps: number[] = []
  let pointerKind = 'mouse'
  let off = false
  let lookX = 0
  let lookY = 0
  let targetX = 0
  let targetY = 0
  let lookRaf = 0
  let hoverCooldownUntil = 0
  let hoverTimer = 0
  let rect: DOMRect | null = null
  let rectAt = 0
  const timers = new Set<number>()

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
    return id
  }

  const setLine = (line: string | null) => {
    bubble.textContent = line ?? ''
    live.textContent = line ?? ''
    if (line) button.setAttribute('data-line', '1')
    else button.removeAttribute('data-line')
  }

  const play = (id: PlayId, line?: string) => {
    last = id
    reaction = id
    targetX = 0
    targetY = 0
    lookX = 0
    lookY = 0
    button.style.setProperty('--vp-x', '0')
    button.style.setProperty('--vp-y', '0')
    button.setAttribute('data-react', id)
    setLine(line ?? (id === 'party' ? PARTY_LINE : REACTION_LINES[id]))
    spawnBits(fx, id)
    const ms = reduce ? 1400 : id === 'party' ? PARTY_MS : REACTION_MS[id]
    later(() => {
      if (reaction !== id) return
      reaction = null
      button.removeAttribute('data-react')
      setLine(null)
      fx.replaceChildren()
    }, ms)
  }

  const stepLook = () => {
    lookRaf = 0
    lookX += (targetX - lookX) * 0.28
    lookY += (targetY - lookY) * 0.28
    if (reduce) {
      button.style.setProperty('--vp-x', '0')
      button.style.setProperty('--vp-y', '0')
      return
    }
    button.style.setProperty('--vp-x', lookX.toFixed(3))
    button.style.setProperty('--vp-y', lookY.toFixed(3))
    if (Math.hypot(targetX - lookX, targetY - lookY) > 0.012) lookRaf = requestAnimationFrame(stepLook)
  }

  const kickLook = () => {
    if (!lookRaf) lookRaf = requestAnimationFrame(stepLook)
  }

  const onPointerDown = (event: PointerEvent) => {
    pointerKind = event.pointerType
  }

  const onClick = (event: MouseEvent) => {
    const now = Date.now()
    stamps = [...stamps.filter((t) => now - t <= WINDOW_MS), now]
    if (isPartyCombo(stamps, now, WINDOW_MS)) {
      stamps = []
      play('party')
    } else {
      const previous = last && last !== 'party' ? last : null
      play(pickReaction(previous))
    }
    if (pointerKind === 'touch' && !reduce) {
      const rect = button.getBoundingClientRect()
      targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2.2))
      targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2.2))
      kickLook()
      later(() => {
        targetX = 0
        targetY = 0
        kickLook()
      }, 700)
    }
  }

  const onMove = (event: PointerEvent) => {
    if (reduce || !fine || off || event.pointerType === 'touch') return
    if (reaction === 'spin' || reaction === 'peekaboo' || reaction === 'party' || reaction === 'rainbow') return
    const now = performance.now()
    if (!rect || now - rectAt > 250) {
      rect = button.getBoundingClientRect()
      rectAt = now
    }
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const dist = Math.hypot(dx, dy)
    const influence = dist < 460 ? 1 - dist / 460 : 0
    targetX = Math.max(-1, Math.min(1, dx / (rect.width * 0.9))) * influence
    targetY = Math.max(-1, Math.min(1, dy / rect.height)) * influence
    kickLook()
  }

  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => {
      hoverTimer = 0
      if (reaction || Date.now() < hoverCooldownUntil) return
      if (Math.random() > 0.5) return
      hoverCooldownUntil = Date.now() + 12000
      const pool = HOVER_POOL.filter((id) => id !== last)
      const id = pool[Math.floor(Math.random() * pool.length)] ?? 'wink'
      const line = HOVER_LINES[Math.floor(Math.random() * HOVER_LINES.length)] ?? HOVER_LINES[0]
      play(id, line)
    }, 2500)
  }

  const onLeave = () => {
    window.clearTimeout(hoverTimer)
    hoverTimer = 0
    targetX = 0
    targetY = 0
    kickLook()
  }

  const scheduleBlink = () => {
    later(() => {
      if (!off && !reaction) {
        button.setAttribute('data-blink', '1')
        const double = Math.random() < 0.25
        later(() => {
          button.removeAttribute('data-blink')
          if (!double) return
          later(() => {
            if (reaction) return
            button.setAttribute('data-blink', '1')
            later(() => button.removeAttribute('data-blink'), 110)
          }, 140)
        }, 130)
      }
      scheduleBlink()
    }, 2600 + Math.random() * 4600)
  }

  const onReduce = () => {
    reduce = reduceMq.matches
    if (reduce) {
      targetX = 0
      targetY = 0
      lookX = 0
      lookY = 0
      button.style.setProperty('--vp-x', '0')
      button.style.setProperty('--vp-y', '0')
      button.removeAttribute('data-blink')
    }
  }

  const onFine = () => {
    fine = fineMq.matches
  }

  const observer = new IntersectionObserver(([entry]) => {
    off = !entry?.isIntersecting
    if (off) button.setAttribute('data-off', '')
    else button.removeAttribute('data-off')
  }, { threshold: 0.08 })

  button.addEventListener('pointerdown', onPointerDown)
  button.addEventListener('click', onClick)
  button.addEventListener('pointerenter', onEnter)
  button.addEventListener('pointerleave', onLeave)
  window.addEventListener('pointermove', onMove, { passive: true })
  reduceMq.addEventListener('change', onReduce)
  fineMq.addEventListener('change', onFine)
  observer.observe(button)
  scheduleBlink()

  const queued = Number(button.getAttribute('data-queued') || '0')
  button.removeAttribute('data-queued')
  if (queued >= 5) play('party')
  else if (queued > 0) play(pickReaction(null))

  return () => {
    observer.disconnect()
    button.removeEventListener('pointerdown', onPointerDown)
    button.removeEventListener('click', onClick)
    button.removeEventListener('pointerenter', onEnter)
    button.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('pointermove', onMove)
    reduceMq.removeEventListener('change', onReduce)
    fineMq.removeEventListener('change', onFine)
    if (lookRaf) cancelAnimationFrame(lookRaf)
    window.clearTimeout(hoverTimer)
    for (const id of timers) window.clearTimeout(id)
    timers.clear()
    button.removeAttribute('data-react')
    button.removeAttribute('data-blink')
    button.removeAttribute('data-off')
    setLine(null)
    fx.replaceChildren()
  }
}
