# Jarvis Bakery OS — Role-Based Home Screens & Permissions Spec

**Version 1.1 — Owner-Configurable Home Layouts and Position-Based Access**

> **Revisions in v1.1 (locked-in decisions):**
> - **Sequenced after the `routes.ts` refactor.** No work on Home.tsx starts until the in-flight routes.ts slicing is done and stable for ~1 week.
> - **Phase 1 (widget registry refactor) budget raised** from 2–3 days to **5–8 working days** for an experienced engineer (longer with Replit Agent). Home.tsx is 1,966 lines with significant cross-widget state; the original estimate was the happy path.
> - **v1 ships with layouts locked.** Users cannot reorder or hide their own widgets. Customization is deferred to v2 only if real demand appears.
> - **Decision #2 (user customization) removed from Part 10** as a result.
> - **"Position" UI rename deferred** until the home-layout tab actually lands, so we don't churn copy twice.
> - **Phase ordering revised:** Phase 3 (editor + "Preview as") ships before Phase 2 (new widgets), so the system is end-to-end-validated with familiar widgets before new ones get bolted on. Phase 2 + Phase 5 then run in parallel; whichever has the harder deadline wins priority.
> - **Confirmed defaults on Part 10 decisions #1, #3, #4, #5** — see updated Part 10.

---

## What this spec is

A complete plan to give you, the owner, the ability to:

1. Define **Positions** (Employee, Shift Lead, Manager, Head of HR, Owner, etc.)
2. Configure a **distinct Home screen layout** for each position
3. Configure a **distinct sidebar / page-access set** for each position
4. Assign positions to employees from a single admin screen
5. Override individual employees when needed (one-offs without breaking the position)

The good news: **~70% of the infrastructure already exists.** Your `permission_levels` table, `users.permissionLevelId`, `sidebarPermissions`, `sectionPermissions`, and `defaultPage` columns are already in the schema and partially wired up. This spec finishes that system and adds the home-layout layer on top.

---

## Part 1 — What you already have (don't rebuild)

Pulled directly from your code:

**`permission_levels` table** (`shared/schema.ts:1469`):
- `name`, `description`, `color`, `rank`
- `sidebarPermissions` (JSONB array — which sidebar items this level can see)
- `sectionPermissions` (JSONB record — which sections of which pages this level can see)

**`users` table** (`shared/models/auth.ts`):
- `permissionLevelId` (FK to permission_levels)
- `sidebarPermissions` and `sectionPermissions` as **per-user overrides**
- `defaultPage` (lands them here on login — already used in `Login.tsx:64`)
- `department` (bakery / kitchen / bar / foh / guest)
- `role` (owner / manager / member)
- Granular flags: `isShiftManager`, `isGeneralManager`, `isDepartmentLead`

**Existing UI:**
- `AdminUsers.tsx` lets you assign `permissionLevelId` and `defaultPage` to users
- `PermissionLevelManager.tsx` lets you create permission levels
- `Home.tsx` already has 16 widgets, a layout editor, hidden/visible state, and section visibility checks via `useSectionVisibility`

**The gap:** Permission levels currently control *what pages people can see in the sidebar*, but **not what their Home screen looks like**. There's no concept of "the HR Manager's Home is built from these widgets, the FOH employee's Home is built from these others." That's what we add.

---

## Part 2 — The mental model

We're introducing one new concept and renaming one existing one for clarity.

**Position** *(the new word for what you're now calling Permission Level)* — a job role at the bakery. A Position bundles three things:
1. **Sidebar access** — which pages this Position can navigate to
2. **Section access** — which sections inside those pages they can see
3. **Home layout** — which widgets appear on their Home screen, and in what order

Each employee is assigned **one Position**. They can also have **per-user overrides** (rare — for "Sarah is a FOH employee but I also want her to see the Schedule page").

> **Naming decision:** I recommend renaming "Permission Level" → "Position" in the UI only. Keep the database table name `permission_levels` (renaming a table mid-flight is risky). The user-facing label is what matters, and "Position" maps to how owners actually think about staff.

---

## Part 3 — Recommended initial Positions

Pre-seed these five Positions when the feature ships. You can edit and add more from the admin UI.

| Position | Rank | Default Page | Daily Drivers (Home Widgets) |
|----------|------|--------------|------------------------------|
| **Employee** (FOH/BOH default) | 10 | `/` (Home) | Next Shift, Unread Messages, Available Shifts, Today's Pre-Shift Note, Quick Actions |
| **Shift Lead** | 20 | `/` | Everything in Employee + Who's On Today, Live Pre-Shift Notes, Problems |
| **Department Lead (Bakery / Kitchen / Bar)** | 30 | `/bakery` or `/kitchen` | Production Today, Lamination Pulse, Today's Orders, Problems, Department Tasks |
| **Manager** | 40 | `/` | All operational widgets + Manager Stats (today's staff count, pending time-off) |
| **Head of HR** | 45 | `/hr` | HR-specific widgets (see Part 5 below) |
| **Owner** | 100 | `/` | All widgets, full layout editor, all admin tools |

---

## Part 4 — Schema changes

Minimal additions. Two new columns on `permission_levels`, one new table for layout templates.

### 4.1 — Add to `permission_levels`

```ts
// In shared/schema.ts, on the permissionLevels table:
homeLayout: jsonb("home_layout").$type<HomeLayoutConfig | null>(),
defaultPage: text("default_page"),  // overrides user.defaultPage if user.defaultPage is null
```

`HomeLayoutConfig` shape:
```ts
type HomeLayoutConfig = {
  visibleWidgets: WidgetId[];        // widgets shown, in render order
  hiddenWidgets: WidgetId[];         // explicitly hidden (for clarity)
  pinnedTop?: WidgetId[];            // always render at top, can't be reordered by user
  allowUserCustomization: boolean;   // can the user reorder/hide their own widgets?
};
```

### 4.2 — Optional: new `home_widgets` registry table

If you want to add widgets without code changes later. **For v1, skip this.** Hardcode the widget registry in `client/src/lib/home-widgets.ts` (Part 6 below). Add the table later if you need runtime widget management.

### 4.3 — Migration

```sql
-- migrations/0004_add_home_layout_to_permission_levels.sql
ALTER TABLE permission_levels ADD COLUMN home_layout jsonb;
ALTER TABLE permission_levels ADD COLUMN default_page text;
```

---

## Part 5 — The Head of HR Position (your concrete near-term ask)

This is the test case for the whole system. When you hire her, you create a Position called "Head of HR" with this configuration:

**Sidebar access** (pages she can navigate to):
- Home
- HR
- Onboarding
- Schedule (read-only)
- Time Cards (read-only)
- Time Review
- Payroll Review
- Messages
- Notes
- Admin → Users
- Admin → Approvals (for time-off approvals)

**Sidebar access she does NOT have:**
- The Firm (financial)
- Recipes / Production / Lamination
- Inventory / Vendors / PFG
- All bakery operational tools

**Home screen widgets** (in order):
1. **HR Pulse** *(new widget — see Part 6.2)* — pending onboarding count, pending time-off count, this week's birthdays, anniversary reminders
2. **Today's Schedule Snapshot** — read-only view of who's on today
3. **Pending Approvals** — time-off requests, onboarding submissions awaiting her review
4. **Recent Hires** — last 5 hires with onboarding completion %
5. **Messages** — unread count
6. **Quick Actions** — Send onboarding invite, Review time card, Compose announcement

**Default landing page on login:** `/hr`

This Position is reusable. If you later hire an HR coordinator under her, you create "HR Coordinator" with a subset of this access (no payroll review, no admin/users).

---

## Part 6 — Frontend implementation

### 6.1 — Widget Registry

Create a single source of truth for all Home widgets. New file:

**`client/src/lib/home-widgets.ts`**
```ts
export type WidgetId =
  // employee-focused
  | "nextShift" | "unreadMessages" | "availableShifts" | "todaysPreShiftNote" | "quickActionsEmployee"
  // operational
  | "briefing" | "announcements" | "laminationPulse" | "preShiftNotes"
  | "production" | "problems" | "forwardLook" | "todayOrders"
  | "myEvents" | "myEventJobs" | "myTasks" | "whosOn"
  // manager
  | "managerStats" | "quickActionsManager"
  // HR
  | "hrPulse" | "pendingApprovals" | "recentHires" | "scheduleSnapshot"
  // owner
  | "ownerFinancialPulse" | "ownerKpiStrip";

export type WidgetCategory = "personal" | "operational" | "managerial" | "hr" | "owner";

export interface WidgetDefinition {
  id: WidgetId;
  label: string;                    // user-facing name in layout editor
  category: WidgetCategory;
  description: string;              // shown in layout editor as helper text
  minRank?: number;                 // lowest rank that can use this widget
  requires?: ("isOwner" | "isManager" | "isHR")[];
  component: React.ComponentType;   // the actual React component
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  nextShift: {
    id: "nextShift",
    label: "My Next Shift",
    category: "personal",
    description: "Shows the user's next upcoming shift with clock-in CTA.",
    component: NextShiftWidget,
  },
  // ...etc for all widgets
};
```

**Why a registry?** Today, Home.tsx has widgets inlined as JSX with a `WIDGET_SECTION_MAP`. Pulling each into its own component file lets you:
- Render *any* layout on Home by mapping over the user's `homeLayout.visibleWidgets`
- Build the layout editor by iterating over `WIDGET_REGISTRY`
- Lazy-load widgets that aren't in the user's layout (perf win)

### 6.2 — New widgets to build

You already have most widgets. New ones to build for this spec:

| Widget | Used by | Notes |
|--------|---------|-------|
| `nextShift` | Employee, Shift Lead | Replaces a section of `mySchedule`. Shows ONE shift, big and clear, with clock-in button when within 30min. |
| `availableShifts` | Employee, Shift Lead | Browse the Shift Bank. List view, one-tap "Request to pick up." |
| `todaysPreShiftNote` | Employee | Read-only view of today's note from manager. |
| `quickActionsEmployee` | Employee | 3–4 buttons: Request time off, Release my shift, Message manager. |
| `hrPulse` | Head of HR | New, summarizes onboarding/time-off/birthdays. |
| `pendingApprovals` | Head of HR, Manager | List of items needing review. |
| `recentHires` | Head of HR | Last 5 hires + onboarding completion %. |
| `scheduleSnapshot` | Head of HR, Owner | Read-only "who's on today" + tomorrow. |

### 6.3 — Refactor Home.tsx

Right now Home.tsx is 1,966 lines. After the registry refactor it becomes ~200 lines. The big change:

**Before:**
```tsx
// 1,500 lines of inlined widget JSX in one file
{isWidgetAllowed("preShiftNotes") && (
  <Card>...300 lines of pre-shift notes UI...</Card>
)}
```

**After:**
```tsx
// Home.tsx — orchestrator only
const layout = useEffectiveHomeLayout(user); // resolves user override → position → fallback
return (
  <div className="space-y-4">
    {layout.visibleWidgets.map(widgetId => {
      const Widget = WIDGET_REGISTRY[widgetId].component;
      return <Widget key={widgetId} />;
    })}
  </div>
);
```

Each widget becomes its own file in `client/src/components/home-widgets/`. This is the largest piece of work in the spec. **Revised budget: 5–8 working days for an experienced engineer, 10–14 days driving Replit Agent.** The original 2–3 day estimate was the happy path; the real number includes regression checking and untangling cross-widget state (briefing polling, section visibility, layout editor state, drag-and-drop, multiple dialogs).

**Behavior must be identical after this refactor.** Layouts are locked to current behavior for every existing user. No user-visible change.

### 6.4 — `useEffectiveHomeLayout` hook

The resolution order:
1. User's per-user override (`user.homeLayoutOverride` if you add it later — skip for v1)
2. The user's Position's `homeLayout`
3. A hardcoded fallback (current Home for owners, minimal for members)

```ts
// client/src/hooks/use-home-layout.ts
export function useEffectiveHomeLayout(user: User): HomeLayoutConfig {
  const { data: position } = useQuery({
    queryKey: ["/api/permission-levels", user.permissionLevelId],
    enabled: !!user.permissionLevelId,
  });

  if (position?.homeLayout) return position.homeLayout;
  return getFallbackLayout(user.role); // hardcoded by role as safety net
}
```

---

## Part 7 — Admin UI changes

### 7.1 — Position Manager (extend `PermissionLevelManager.tsx`)

Add a third tab: **Home Screen**.

```
┌──────────────────────────────────────────────┐
│ Position: Head of HR                          │
├──────────────────────────────────────────────┤
│ [Sidebar Access] [Section Access] [Home]      │
├──────────────────────────────────────────────┤
│ Drag to reorder. Toggle to show/hide.         │
│                                                │
│ ☑ HR Pulse           [drag handle]             │
│ ☑ Today's Schedule   [drag handle]             │
│ ☑ Pending Approvals  [drag handle]             │
│ ☑ Recent Hires       [drag handle]             │
│ ☑ Messages           [drag handle]             │
│ ☐ Production Today   (hidden)                  │
│ ☐ Lamination Pulse   (hidden)                  │
│ ...                                            │
│                                                │
│ Default landing page: [/hr ▾]                  │
│ ☐ Allow users to customize their own layout    │
└──────────────────────────────────────────────┘
```

Use `@dnd-kit/sortable` (already widely compatible with shadcn) for the drag-and-drop. Persist on save via `PATCH /api/permission-levels/:id`.

### 7.2 — Live Preview

In the Position editor, add a **"Preview as this Position"** button. Owner clicks → modal shows a fully-rendered Home screen as that Position would see it. No need for fake data — just render with the real widgets, read-only. This is the killer feature for this UI; you'll lean on it.

### 7.3 — User assignment (already works in `AdminUsers.tsx`)

You already have `defaultPageMutation` and the permission level dropdown. Just rename labels to "Position" and you're done.

---

## Part 8 — Backend changes

Minimal. Most of the work is on the frontend.

### 8.1 — New endpoints

```
GET  /api/permission-levels/:id              # already exists
PATCH /api/permission-levels/:id              # already exists, extend to accept homeLayout
GET  /api/me/home-layout                      # NEW — returns resolved layout for current user
POST /api/permission-levels/:id/preview       # NEW — owner-only, returns layout for preview-as
```

### 8.2 — Existing endpoint to enhance

`GET /api/home` (the home page data endpoint) currently returns the same payload for everyone. Update it to:
- Return only the data the user's widgets actually need
- Skip expensive queries (e.g., `bakeoffSummary`) if no enabled widget consumes them

This is a meaningful perf win once the widget registry is in place.

---

## Part 9 — Migration & rollout

A safe, low-risk path. The system has live employees already.

### Phase −1 — Prerequisite (in flight)
**Finish the `routes.ts` refactor and let it bake for ~1 week.** No work on Home starts until then. Running two big concurrent refactors on a live revenue system is how you end up with a Tuesday where neither schedules nor financial reports work and you can't tell which refactor caused it.

### Phase 0 — No user-facing change (1 day)
- Add the migration (Part 4.3)
- Add `homeLayout` and `defaultPage` columns to `permission_levels`
- Deploy. Nothing breaks because no code reads the new columns yet.

### Phase 1 — Widget registry refactor (5–8 days)
- Move every existing Home widget into its own file under `client/src/components/home-widgets/`
- Build the `WIDGET_REGISTRY` and `useEffectiveHomeLayout` hook
- Home.tsx still renders the same widgets in the same order — but now via the registry
- **Critical:** at this point, behavior is identical for users. Pure refactor. Layouts locked to current behavior.

### Phase 3 — Position editor UI (2 days) *— ships before Phase 2*
- Add the "Home Screen" tab to `PermissionLevelManager.tsx`
- Add the "Preview as this Position" feature
- Seed the five default Positions (Part 3) using **only existing widgets** so the system is end-to-end-validated with familiar parts before new widgets are bolted on.
- This is also the moment to do the **"Permission Level" → "Position"** UI rename in one pass.

### Phase 2 — New employee widgets (2 days) *— parallel with Phase 5*
- Build `nextShift`, `availableShifts`, `todaysPreShiftNote`, `quickActionsEmployee`
- These can be tested in isolation before being added to anyone's layout

### Phase 5 — HR Position widgets (2 days) *— parallel with Phase 2*
- Build `hrPulse`, `pendingApprovals`, `recentHires`, `scheduleSnapshot`
- **Whichever of Phase 2 or Phase 5 has the harder external deadline gets priority.** If the new HR hire starts in 3 weeks, Phase 5 jumps the line; if she's 8+ weeks out, Phase 2 goes first because more existing employees benefit.

### Phase 4 — Roll out per Position, one at a time (gradual)
- Week 1: Configure the **Employee** Position. Move 2–3 trusted employees onto it. Get feedback.
- Week 2: Roll all FOH/BOH employees onto Employee Position.
- Week 3: Configure **Shift Lead** and **Manager** Positions.
- When HR starts: configure her Position the day before. She logs in and sees her own world. If Phase 5 widgets aren't ready yet, ship her a **minimal HR Position** (sidebar access + `defaultPage: /hr` + the existing HR page) on day one. A clean sidebar and the right landing page is 80% of the experience; the bespoke `hrPulse` widget is polish.

**Total engineering budget:** ~13–17 working days for an experienced full-stack TypeScript engineer. Likely 22–30 days driving Replit Agent, depending on prompt quality and how much rework each phase needs. **This is on top of the remaining `routes.ts` refactor work** (~3–5 weeks at slice-a-week pace).

---

## Part 10 — Decisions (locked in)

All four open decisions have been confirmed by the owner. Recorded here for the record:

1. **Naming: "Position"** — confirmed. UI rename happens in Phase 3 when the home-layout tab ships, not before. Database table stays `permission_levels`.

2. ~~**User customization.**~~ **Removed.** v1 ships with layouts locked for everyone. Customization is deferred to v2 only if real demand appears. This drops a meaningful amount of edge-case surface area from v1.

3. **One Position per user — confirmed.** Single FK on `users.permissionLevelId`. Layered overrides (Shift Lead, Department Lead) continue to use the existing `isShiftManager` / `isDepartmentLead` boolean flags.

4. **User `defaultPage` overrides Position `defaultPage` — confirmed.** Both fall back to `/`. Resolution order: `user.defaultPage` → `position.defaultPage` → `/`.

5. **Hidden widgets are truly hidden — confirmed.** No "show me the hidden ones" toggle for end users. If a Position needs a widget, the owner adds it to that Position.

---

## Part 11 — What this gets you

When this ships:

- **Day 1 of HR's employment**, she logs in and sees an HR-shaped Home screen, an HR-shaped sidebar, and lands on `/hr`. She doesn't see The Firm, Recipes, or Lamination. She sees onboarding, time-off approvals, schedule snapshot, and messages.
- **Your young FOH/BOH employees** open the app on their phone and see four things: their next shift, their unread messages, the Shift Bank, and the day's pre-shift note. Nothing else. The cognitive overhead drops to near-zero.
- **You as Owner** keep your full dashboard, plus a "Preview as Employee / Preview as HR / Preview as Manager" button you can use to sanity-check what each person sees.
- **When you hire your next role** (catering manager, sous chef, marketing lead), you create a new Position in 5 minutes, drag widgets in, save, and assign. No engineering required.

This is the foundation that turns Jarvis from "the owner's app that everyone uses" into "an OS where every role has a purpose-built workspace."

---

## Appendix A — File-by-file change list

**New files**
- `client/src/lib/home-widgets.ts` — registry
- `client/src/components/home-widgets/*.tsx` — one file per widget (~20 files)
- `client/src/hooks/use-home-layout.ts` — layout resolver hook
- `client/src/components/PositionHomeEditor.tsx` — drag-and-drop editor (the "Home Screen" tab)
- `client/src/components/PositionPreviewModal.tsx` — "Preview as" modal
- `migrations/0004_add_home_layout_to_permission_levels.sql`

**Modified files**
- `shared/schema.ts` — extend `permissionLevels` schema
- `client/src/pages/Home.tsx` — collapse to ~200 lines, render via registry
- `client/src/components/PermissionLevelManager.tsx` — add "Home Screen" tab, live preview button
- `client/src/pages/AdminUsers.tsx` — rename "Permission Level" → "Position" in UI labels only
- `server/routes.ts` — extend `PATCH /api/permission-levels/:id` to validate `homeLayout`
- `server/replit_integrations/auth/routes.ts` — `/api/me/home-layout` endpoint

**No changes needed**
- Authentication, login flow, push notifications, all backend engines.

---

## Appendix B — A note on naming and tone

You mentioned your team is mostly young women. Two small UI choices to keep in mind as widgets get built:

- **Tone in the widget labels.** "My Next Shift" reads warmer than "Upcoming Assignment." "Available Shifts" reads warmer than "Open Shift Inventory." Pick the warmer phrasing wherever the meaning is identical.
- **Default empty states.** When an employee has no available shifts to pick up, the empty state should say "Nothing available right now — we'll let you know when something opens up." Not "No data." Empty states are where products earn or lose trust. Budget the time to write them.
