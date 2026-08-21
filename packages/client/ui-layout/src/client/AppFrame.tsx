/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * details), the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_DEFAULT,
  SIDEBAR_MOBILE_DRAWER,
  SIDEBAR_MOBILE_DRAWER_GUTTER,
  SIDEBAR_MOBILE_DRAWER_MAX,
} from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode; elementRef: RefObject<HTMLDivElement>; inactive: boolean }) {
  return <div ref={props.elementRef} className={css.centerCol} aria-hidden={props.inactive || undefined}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode; elementRef: RefObject<HTMLDivElement>; inactive: boolean }) {
  return <div ref={props.elementRef} className={css.detailsCol} aria-hidden={props.inactive || undefined}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const detailsRef = useRef<HTMLDivElement | null>(null)
  const mobileNavButtonRef = useRef<HTMLButtonElement | null>(null)
  const sidebarId = useId()
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  const mobile = viewport < SIDEBAR_MOBILE_DRAWER
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const solvedCols = computeColumns(viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
  // A phone gets the entire frame for conversation content. The sidebar stays
  // mounted and full-width in an off-canvas drawer, while details remains
  // mounted at zero width so neither subtree loses local state.
  const cols = mobile
    ? { sidebar: 0, center: viewport, details: 0 }
    : solvedCols
  const mobileDrawerWidth = Math.min(SIDEBAR_MOBILE_DRAWER_MAX, Math.max(0, viewport - SIDEBAR_MOBILE_DRAWER_GUTTER))
  const mobileDrawerOpen = mobile && !sidebarCollapsed
  const mobileDetailsOpen = mobile && detailsSession !== undefined && panels.details > 0
  const colsRef = useRef(cols)
  colsRef.current = cols

  // Escape dismisses the phone drawer. Focus enters the drawer when it opens
  // and returns to the persistent menu control when it closes.
  const mobileDrawerWasOpen = useRef(false)
  useLayoutEffect(() => {
    if (sidebarRef.current !== null) sidebarRef.current.inert = mobile && !mobileDrawerOpen
    if (centerRef.current !== null) centerRef.current.inert = mobileDrawerOpen || mobileDetailsOpen
    if (detailsRef.current !== null) detailsRef.current.inert = mobile && (!mobileDetailsOpen || mobileDrawerOpen)
    if (mobileDrawerOpen) {
      mobileDrawerWasOpen.current = true
      sidebarRef.current?.focus()
      return
    }
    if (mobileDrawerWasOpen.current) {
      mobileDrawerWasOpen.current = false
      mobileNavButtonRef.current?.focus()
    }
  }, [mobile, mobileDetailsOpen, mobileDrawerOpen])
  useEffect(() => {
    if (!mobileDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') actions.toggleSidebar()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [actions, mobileDrawerOpen])
  const onSidebarClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!mobileDrawerOpen || !(event.target instanceof Element)) return
    // Session rows expose aria-selected while workspace grouping rows expose
    // aria-expanded. Close only after navigation, not while users browse a
    // workspace group or use the sidebar's search and view controls.
    if (event.target.closest('[role="treeitem"][aria-selected]') !== null) actions.toggleSidebar()
  }, [actions, mobileDrawerOpen])

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-open={mobileDrawerOpen || undefined}
      data-mobile-details-open={mobileDetailsOpen || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-mobile={mobile || undefined}
      data-dragging={dragging || undefined}
    >
      {mobileDrawerOpen && (
        <button type="button" className={css.mobileBackdrop} aria-label="Close navigation" tabIndex={-1} onClick={actions.toggleSidebar} />
      )}
      <div
        ref={sidebarRef}
        id={sidebarId}
        className={css.sidebarCol}
        style={mobile ? { width: mobileDrawerWidth } : undefined}
        tabIndex={mobile ? -1 : undefined}
        aria-hidden={mobile && !mobileDrawerOpen || undefined}
        onClickCapture={onSidebarClickCapture}
      >
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: mobile ? false : sidebarCollapsed,
          width: mobile ? mobileDrawerWidth : cols.sidebar,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; the strict details entry naturally renders
            empty while no session is current. */}
        <CenterColumn elementRef={centerRef} inactive={mobileDrawerOpen || mobileDetailsOpen}>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn elementRef={detailsRef} inactive={mobile && (!mobileDetailsOpen || mobileDrawerOpen)}>{renderSlot('details', {})}</DetailsColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      <button
        ref={mobileNavButtonRef}
        type="button"
        className={css.mobileNavButton}
        aria-label="Open navigation"
        aria-controls={sidebarId}
        aria-expanded={mobileDrawerOpen}
        hidden={!mobile || mobileDrawerOpen || mobileDetailsOpen}
        onClick={actions.toggleSidebar}
      >
        <span />
        <span />
        <span />
      </button>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!mobile && !sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {!mobile && cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
