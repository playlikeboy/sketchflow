# Plan 04: UX Overhaul & Duolingo Animations

## Goal
Overhaul the landing page, project views, and component stylings to be visually stunning, using rich colors, premium gradients, glassmorphism, and active 3D button animations inspired by the Duolingo Design System.

## Proposed Changes

### 1. Global CSS Design Tokens & Utilities
In [globals.css](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/app/globals.css):
- Inject the color system tokens (Feather Green `#58CC02`, Macaw Blue `#1CB0F6`, Cardinal Red `#FF4B4B`, Beetle Purple `#CE82FF`, Humpback Deep Blue, Fox Orange, and corresponding 3D shadows).
- Create `.btn-3d` button utilities that implement the signature 3D tactile button press.
- Set up custom scrollbar stylings and backdrop blur (glassmorphism) utilities.

### 2. Website Landing Page Overhaul
Redesign [home-client.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/home-client.tsx):
- Introduce a dark-themed/high-contrast hero section with vibrant gradients and glowing cards.
- Add micro-animations on cards: hover card scales, smooth borders, and responsive details.
- Add clear call-to-actions with the green 3D press effect.
- Rearrange layout of personas, workflow, and features into a dense, clean presentation.

### 3. Navigation and Cards Refactor
Revamp [projects-home-client.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/projects-home-client.tsx) and [workspace-client.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/workspace-client.tsx):
- Apply card shadows, smooth transitions, and border radius matching DDS.
- Upgrade workspace list cards to show quick repository branch details.
- Standardize all action buttons using the 3D button styles.

## Verification
- Run local server and inspect landing page across mobile/desktop viewports.
- Click buttons and check if the tactile press downward (`translateY(4px)`) works perfectly and feels extremely native.
- Check dark mode toggle and verify color harmonies.
