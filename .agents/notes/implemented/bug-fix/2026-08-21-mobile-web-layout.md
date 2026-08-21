# Agent Note: Mobile Web layout preserves the conversation width

Status: implemented

English | [中文](2026-08-21-mobile-web-layout.zh.md)

## Problem

AppFrame collapsed its sidebar to a persistent 56px rail below 1024px. A 390px phone therefore lost more than one seventh of its conversation width before chat content rendered. Opening the sidebar restored a 280px inline column and left only 110px for the conversation, so headings, controls, and the composer broke into narrow strips. The Settings panel compounded the problem: its 188px desktop navigation rail remained beside the content inside a panel capped to the phone viewport, leaving the active settings page too narrow for ordinary sentences or controls.

The narrow state was not merely a spacing defect. Sidebar, conversation, and details are mounted slot owners with local viewing state, and Settings is a fixed-position descendant of the sidebar. A mobile treatment that unmounted a column or transformed its ancestor would fix one screenshot while breaking state retention or constraining the Settings overlay to the drawer.

## Decision

AppFrame measures its own frame and uses a dedicated phone presentation below 720px. The conversation grid track takes the full frame, the mounted details track resolves to zero unless details is open as a full-frame takeover, and the mounted sidebar becomes an off-canvas drawer. The drawer is at most 340px wide and leaves at least 24px of the frame available as a dismissal edge. Its slot always receives the wide owner shape on phones, while the stored desktop sidebar preference remains untouched.

The drawer transitions with `left`, not `transform`, so fixed-position descendants still use the viewport as their containing block. A 44px menu control opens it; the backdrop, Escape, the sidebar collapse control, and selecting a Session close it. The closed drawer is inert and hidden from the accessibility tree. Opening moves focus to the drawer and marks the conversation and details inert; closing restores focus to the menu control. Workspace group expansion, search, and view controls keep the drawer open because those actions are navigation preparation rather than destination selection.

The Settings shell switches below 640px from the desktop two-column panel to a safe-area-aware full-height sheet. Its section navigation becomes a horizontally scrollable tab row, header actions occupy their own row, the close target grows to 40px, and only the selected section scrolls vertically. Conversation chrome consumes the AppFrame mobile variables for a 64px header clearance, tighter transcript and composer insets, safe-area bottom padding, horizontally scrollable tabs, and larger composer toolbar targets.

The 720–1023px layout keeps the compact rail and its existing [rail-search gesture guard](2026-08-18-rail-search-outside-click-self-dismissal.md); desktop concession and drag behavior is unchanged.

## Alternatives considered

**Keep the 56px rail and expand it inline.** Rejected because the rail permanently taxes the smallest viewport and inline expansion leaves the conversation unusable at phone widths.

**Animate the drawer with `transform`.** Rejected because a transformed sidebar becomes the containing block for its fixed descendants; the Settings overlay would be clipped to the drawer instead of covering the viewport.

**Unmount sidebar and details content on phones.** Rejected because slot identity and local state must survive closing and reopening. The phone presentation changes geometry and interactivity while keeping both subtrees mounted.

**Use only window media queries.** Rejected for AppFrame because the shell may be embedded in a narrower container than the browser window. The component's `ResizeObserver` remains the geometry authority; viewport media queries are reserved for the fixed Settings sheet and conversation touch styling.

## Verification

Focused AppFrame component tests pin the phone tracks, wide drawer owner props, backdrop and Escape dismissal, focus return, inert background, Session-selection dismissal, hidden resize handles, and details takeover. Assembled Web verification at 390×844 and 430×932 checks the closed conversation, open drawer, Settings sheet, and absence of horizontal document overflow.

## Consequences

Phone users receive the complete conversation width, a readable Settings page, reachable Session navigation, and full-screen tool details without sacrificing the mounted-state guarantees used by wider layouts. The cost is a second presentation mode in AppFrame and two responsive thresholds: 720px for frame-owned columns and 640px for the fixed Settings surface. Drawer and sheet geometry must continue to be verified in a real browser because CSS grid auto-placement and fixed-position containing blocks are not represented by jsdom layout tests.
