# Plan 05: Visual Online Store Builder

## Goal
Let users visually sketch and preview basic online stores/catalogs inside Sketchflow canvases.

## Proposed Changes

### 1. Online Store Canvas Template
- In `/app/templates`, add an "Online Store Catalog" card.
- Seed a starter template in `excalidraw-libraries.ts` that includes store modules (product card boxes, header menus, checkout forms).

### 2. Store Canvas Compiler / Exporter
In the canvas editor, add a "Deploy Store" button:
- Parses the active Excalidraw sketch elements.
- Extracts product text details, images, and buttons with `#product` or `#buy` labels.
- Compiles elements into a clean responsive store landing page, including Stripe payment links, served under `/share/{owner}/{repo}/{projectId}/store`.

### 3. Store Share View
Create a route `/share/[owner]/[repo]/[projectId]/store/page.tsx`:
- Renders the compiled online store as a real interactive webpage rather than a canvas drawing viewer.
- Adds buy click handlers that link to Stripe payment checkouts.

## Verification
- Load the "Online Store" template.
- Draw custom product layout and tag with `#buy` button labels.
- Click "Deploy Store". Visit the store page and verify it renders as a regular web product catalog page.
