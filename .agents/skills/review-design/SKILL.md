---
name: review-design
description: Reviews a code component against its Figma design to identify visual discrepancies in colors, spacing, padding, margins, typography, and layout. Use when user says "review design", "compare design", "design review", "check against Figma", "audit component", "design diff", "compare component to Figma", or wants to verify implementation matches a Figma spec. Takes a Figma node ID and a component file path as arguments. Requires Figma MCP server connection.
metadata:
  mcp-server: figma, figma-desktop
---

# Review Design

## Overview

This skill reviews an existing component from a design system component library against its Figma design source. It fetches the Figma design context and screenshot, reads the component's vanilla CSS and resolves all CSS custom properties to their computed values, then produces a detailed audit of visual discrepancies.

The primary use case is auditing individual components in a component library that implements a design system. Components use vanilla CSS and rely heavily on CSS custom properties (variables) for theming and token values.

## Prerequisites

- Figma MCP server must be connected and accessible
- User must provide two arguments:
  1. **Figma node ID** - The node ID of the design to review against (e.g., `42-15` or `42:15`)
  2. **Component path** - The file path to the code component to review (e.g., `src/components/Button/Button.css` or `src/components/Button/`)
- Optionally, a Figma file key if using the remote MCP server (not needed for `figma-desktop`)

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Parse Arguments

Extract the two required arguments from the user's request:

- **Figma node ID** - May be provided as `42-15` or `42:15` format. Normalize to the format expected by the MCP tool.
- **Component path** - The file path to the component. This may be a CSS file, a JS/TS file, or a directory containing the component.

If the user provides a full Figma URL instead of a bare node ID, extract the file key and node ID from the URL:

**URL format:** `https://figma.com/design/:fileKey/:fileName?node-id=1-2`

**Note:** When using `figma-desktop` MCP, `fileKey` is not required. The server uses the currently open file.

### Step 2: Fetch Design Context from Figma

Run `get_design_context` with the node ID (and file key if applicable).

```
get_design_context(fileKey=":fileKey", nodeId="42-15")
```

Extract and catalog the following design properties:

- **Colors** - All fill colors, stroke colors, text colors (hex, rgba, or Figma variable references)
- **Spacing** - Padding (top, right, bottom, left), item spacing / gap
- **Typography** - Font family, font size, font weight, line height, letter spacing
- **Sizing** - Width, height, min/max constraints
- **Borders** - Border width, border radius, border color
- **Shadows** - Box shadows, drop shadows (offset, blur, spread, color)
- **Layout** - Auto Layout direction, alignment, distribution, wrap behavior
- **Opacity** - Layer opacity values

### Step 3: Capture Visual Reference

Run `get_screenshot` with the same node ID for a visual reference.

```
get_screenshot(fileKey=":fileKey", nodeId="42-15")
```

This screenshot is the visual source of truth for the review.

### Step 4: Read the Component and Resolve CSS Custom Properties

This is the most critical step. The component library uses vanilla CSS with heavy reliance on CSS custom properties. You must resolve all variable indirection to get actual computed values.

#### 4a: Read the component files

Read all files that make up the component:
- The component's CSS file(s) (e.g., `Button.css`)
- The component's markup/JS file(s) (e.g., `Button.js`, `Button.tsx`) to understand which CSS classes are applied and how variants work

#### 4b: Identify all CSS custom properties used

Scan the component's CSS for all `var(--...)` references. Build a list of every custom property the component depends on. For example:

```css
.button {
  background-color: var(--color-primary);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}
```

Custom properties to resolve: `--color-primary`, `--space-3`, `--space-4`, `--radius-md`, `--font-size-sm`

#### 4c: Resolve custom properties to actual values

Search the codebase for where these custom properties are defined. Common locations:

- A global tokens/variables CSS file (e.g., `tokens.css`, `variables.css`, `theme.css`)
- A `:root` block in a global stylesheet
- Component-scoped custom properties defined in the same CSS file
- Custom properties that reference other custom properties (follow the chain)

**Read these token files and resolve each variable to its final value.** For example:

```css
/* tokens.css */
:root {
  --color-primary: #2563EB;
  --space-3: 12px;
  --space-4: 16px;
  --radius-md: 8px;
  --font-size-sm: 14px;
}
```

If a custom property references another custom property, keep following the chain:

```css
:root {
  --blue-600: #2563EB;
  --color-primary: var(--blue-600); /* resolve to #2563EB */
}
```

**Important:** Also check for `var(--..., fallback)` default values. Note both the variable reference and the fallback.

#### 4d: Build a resolved property map

Create a complete map of the component's visual properties with resolved values:

| CSS Property | Raw CSS Value | Resolved Value |
|---|---|---|
| background-color | `var(--color-primary)` | `#2563EB` |
| padding-top | `var(--space-3)` | `12px` |
| padding-left | `var(--space-4)` | `16px` |
| border-radius | `var(--radius-md)` | `8px` |
| font-size | `var(--font-size-sm)` | `14px` |

### Step 5: Compare and Identify Discrepancies

Systematically compare the Figma design properties (Step 2) against the resolved CSS values (Step 4d). Check each category:

#### Colors
- Background colors match Figma fills
- Text colors match Figma text fills
- Border colors match Figma strokes
- Shadow colors match Figma effects
- Opacity values match
- Check that the correct CSS custom property is used (e.g., using `--color-primary` not a hardcoded hex)

#### Spacing
- Padding values match Figma auto layout padding
- Gap/item spacing matches Figma auto layout item spacing
- Check that spacing uses token variables, not hardcoded pixel values

#### Typography
- Font family matches
- Font size matches
- Font weight matches
- Line height matches
- Letter spacing matches

#### Sizing
- Width/height match or follow Figma constraints (fixed, hug, fill)
- Min/max constraints are respected

#### Borders
- Border radius matches
- Border width matches
- Border style matches

#### Shadows
- Shadow offset (x, y) matches
- Shadow blur matches
- Shadow spread matches
- Shadow color matches

#### Layout
- Flex direction matches auto layout direction
- Alignment matches auto layout alignment
- Distribution/justify matches auto layout distribution

#### Component Variants
- If the Figma component has variants (size, state, theme), check that the CSS handles each variant
- Verify variant-specific overrides use the correct custom properties

### Step 6: Produce the Review Report

Generate a structured report with the following format:

```
## Design Review: [Component Name]

### Summary
[1-2 sentence overview: how closely the implementation matches the design]

### CSS Custom Properties Audit
[Table showing each variable used, its resolved value, and whether it matches Figma]

| Variable | Resolved Value | Figma Value | Status |
|---|---|---|---|
| `--color-primary` | `#2563EB` | `#2563EB` | Match |
| `--space-3` | `12px` | `16px` | Mismatch |

### Discrepancies Found

#### Critical (Visual impact: High)
[Issues that cause obvious visual differences]
- Category: [e.g., Colors, Spacing]
- CSS Property: [e.g., background-color]
- CSS Variable: [e.g., `var(--color-primary)`]
- Resolved Value: [computed value]
- Figma Value: [value from design]
- Location: [file:line]

#### Minor (Visual impact: Low)
[Issues that cause subtle visual differences]
- Same format as above

### Hardcoded Values
[List any visual properties using hardcoded values instead of CSS custom properties]

### Missing Properties
[Properties present in Figma but absent from the CSS entirely]

### Matches
[Brief summary of what matches correctly]

### Recommendations
[Specific CSS changes to resolve each discrepancy, referencing exact custom property names]
```

**Report guidelines:**

- Always show the CSS custom property name alongside the resolved value
- Flag any hardcoded values (raw hex codes, pixel values) that should use a custom property instead
- Note any properties present in Figma but missing entirely from the CSS
- If the component has interactive states (hover, active, disabled, focus) visible in Figma, check those too
- For variant-based components, report discrepancies per variant

### Step 7: Suggest Fixes

Offer specific CSS edits to resolve each discrepancy. Reference exact lines in the component's CSS file. Fixes should:

- Use existing CSS custom properties where possible
- Suggest new custom properties only if an appropriate one doesn't exist
- Preserve the component's existing structure and conventions

## Examples

### Example 1: Reviewing a Button Component

User says: "review design 42-15 src/components/Button/"

**Actions:**

1. Parse arguments: nodeId=`42-15`, component=`src/components/Button/`
2. Run `get_design_context(nodeId="42-15")` - Extract: background `#2563EB`, padding `12px 24px`, border-radius `8px`, font-size `14px`, font-weight `600`
3. Run `get_screenshot(nodeId="42-15")` - Visual reference captured
4. Read `src/components/Button/Button.css`:
   ```css
   .button {
     background-color: var(--color-primary);
     padding: var(--space-2) var(--space-4);
     border-radius: var(--radius-md);
     font-size: var(--font-size-sm);
     font-weight: var(--font-weight-semibold);
   }
   ```
5. Read `tokens.css` to resolve variables:
   - `--color-primary` = `#2563EB`
   - `--space-2` = `8px`
   - `--space-4` = `16px`
   - `--radius-md` = `8px`
   - `--font-size-sm` = `14px`
   - `--font-weight-semibold` = `600`
6. Compare:
   - Background: Match (`#2563EB`)
   - Padding top/bottom: Mismatch - Figma `12px` vs `var(--space-2)` = `8px`
   - Padding left/right: Mismatch - Figma `24px` vs `var(--space-4)` = `16px`
   - Border radius: Match (`8px`)
   - Typography: Match

**Report excerpt:**

```
## Design Review: Button

### Summary
Button component has correct colors, border radius, and typography but padding is off on both axes.

### CSS Custom Properties Audit

| Variable | Resolved Value | Figma Value | Status |
|---|---|---|---|
| `--color-primary` | `#2563EB` | `#2563EB` | Match |
| `--space-2` | `8px` | `12px` (top/bottom) | Mismatch |
| `--space-4` | `16px` | `24px` (left/right) | Mismatch |
| `--radius-md` | `8px` | `8px` | Match |

### Discrepancies Found

#### Critical (Visual impact: High)
- Category: Spacing
- CSS Property: padding
- CSS Value: `var(--space-2) var(--space-4)` (8px 16px)
- Figma Value: 12px 24px
- Location: Button.css:3
- Note: The token values themselves may be correct. Check if `--space-3` (12px) and `--space-6` (24px) exist and should be used instead.

### Recommendations
- Change padding to `var(--space-3) var(--space-6)` if those tokens exist and resolve to 12px/24px
- If no matching tokens exist, this may indicate a design system token gap to flag with the design team
```

### Example 2: Reviewing with Hardcoded Values

User says: "review design 10-5 src/components/Card/Card.css"

**Actions:**

1. Parse arguments: nodeId=`10-5`, component=`src/components/Card/Card.css`
2. Fetch design context and screenshot
3. Read `Card.css` - Find a mix of custom properties and hardcoded values:
   ```css
   .card {
     background-color: var(--color-surface);
     border: 1px solid #E5E7EB;           /* hardcoded! */
     border-radius: var(--radius-lg);
     padding: 24px;                        /* hardcoded! */
     box-shadow: 0 1px 3px rgba(0,0,0,0.1);  /* hardcoded! */
   }
   ```
4. Flag hardcoded border color, padding, and shadow as token compliance issues
5. Compare hardcoded values against Figma to see if they at least match the design

**Report flags:** Three hardcoded values that should use CSS custom properties, plus checks whether the hardcoded values match Figma.

### Example 3: Using a Full Figma URL

User says: "review design https://figma.com/design/kL9xQn2VwM8pYrTb4ZcHjF/DesignSystem?node-id=42-15 src/components/Header/"

**Actions:**

1. Parse URL: fileKey=`kL9xQn2VwM8pYrTb4ZcHjF`, nodeId=`42-15`, component=`src/components/Header/`
2. Proceed with the same workflow using both fileKey and nodeId in MCP calls

## Best Practices

### Always Resolve the Full Variable Chain

Never compare a CSS custom property name against a Figma value. Always resolve `var(--x)` to its final computed value. Follow chains where `--x: var(--y)` references another variable.

### Check All States

If the Figma node contains variants or interactive states (hover, focus, active, disabled), review each state individually. Check that the component's CSS includes corresponding selectors (`:hover`, `:focus`, `:active`, `[disabled]`, `.is-active`, etc.) and that the values in those selectors match Figma.

### Flag Token Compliance

One of the most valuable outputs of this review is identifying hardcoded values that should use CSS custom properties. Even if a hardcoded `#2563EB` matches the Figma spec today, it should still use `var(--color-primary)` for maintainability. Always flag this.

### Prioritize by Visual Impact

Not all discrepancies are equal. A 1px padding difference is less critical than a wrong background color. Categorize findings by visual impact to help prioritize fixes.

### Handle Complex Components

For large or deeply nested components, break the review into sections. Use `get_metadata` to understand the Figma node tree and review each logical section separately.

### Check the Storybook

If a Storybook instance is running or accessible, note the Storybook URL for the component in the report. This gives the developer a quick way to visually verify fixes. Do not attempt to screenshot Storybook automatically unless the user provides a running URL.

## Common Issues and Solutions

### Issue: Figma design context is truncated

**Cause:** The component is too complex for a single response.
**Solution:** Use `get_metadata(nodeId="...")` to get the node structure, then fetch specific child nodes individually with `get_design_context`.

### Issue: Cannot find where a CSS custom property is defined

**Cause:** The variable may be defined in a file outside the obvious locations, or may be injected at runtime.
**Solution:** Search the entire codebase for the variable name (e.g., `--color-primary`). Check for definitions in `:root`, `:host`, `[data-theme]`, or media query blocks. If the variable is set dynamically via JavaScript, note this in the report as a limitation.

### Issue: Custom property has different values in different contexts

**Cause:** The variable may be overridden in dark mode, responsive breakpoints, or theme variants (e.g., `[data-theme="dark"] { --color-primary: #93C5FD; }`).
**Solution:** Report the default (`:root`) value as the primary comparison. Note any contextual overrides and whether Figma has corresponding variants for those contexts.

### Issue: Figma uses design tokens / variables

**Cause:** Figma may return variable references (e.g., `{color.primary}`) instead of raw hex values.
**Solution:** This is a good sign - it means the design system is token-based on both sides. Map the Figma variable name to the corresponding CSS custom property name and verify they resolve to the same value.

### Issue: Component has responsive behavior not visible in a single Figma frame

**Cause:** Figma may have multiple frames for different breakpoints.
**Solution:** Ask the user for additional node IDs representing other breakpoints if responsive review is needed.

## Additional Resources

- [Figma MCP Server Documentation](https://developers.figma.com/docs/figma-mcp-server/)
- [Figma MCP Server Tools and Prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma Variables and Design Tokens](https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma)
