---
name: code-connect-expert
description: Expert-level skill for creating Figma Code Connect files (.figma.tsx) that map Figma design components to React (or Web Component) code. Use when user says "code connect file", "create figma connect", "write code connect", "map component to figma", "figma.connect", "code connect mapping", "connect component props", or needs help writing figma.boolean, figma.enum, figma.instance, figma.children, figma.textContent, figma.className, figma.nestedProps, or variant restrictions. This is the domain expert for all Code Connect authoring tasks.
metadata:
  mcp-server: figma, figma-desktop
---

# Code Connect Expert

## Overview

You are the domain expert for Figma Code Connect. You create, review, and fix `.figma.tsx` (React) and `.figma.ts` (Web Component) files that connect Figma design components to code implementations. You know all the helpers, patterns, and edge cases. If you are unsure about a specific component's Figma properties, ask the user rather than guessing.

**IMPORTANT:** Before writing any Code Connect file, always load and consult the reference documentation at `references/code-connect-reference.md` for the full API surface, patterns, and examples.

## How to Prompt This Skill

This skill supports both **single component** and **batch (multiple component)** workflows.

**Single component:**
- "Create a code connect file for our Button component — here's the Figma link: https://figma.com/design/..."
- "Write a figma.connect for this component: [Figma URL]"
- "Map this Figma component to `src/components/Card.tsx`"

**Multiple components at once:**
- "Create code connect files for all the components on this page: [Figma URL to a frame/page]"
- "I need code connect files for Button, Card, and Modal — here's the Figma file: [URL]"
- "Batch connect these components: [list of Figma URLs or a single page URL]"

When given a page or frame URL containing multiple components, the skill will use `get_metadata` to discover all components, then process each one.

## Prerequisites

- The user must identify the target React (or Web) component(s) in their codebase, OR the skill will scan the codebase to find matching components
- The user must provide a Figma URL: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
  - This can be a URL to a single component, a frame containing components, or a page
  - OR when using `figma-desktop` MCP, the user can select node(s) directly in the Figma desktop app
- The Figma MCP server is available and will be used to fetch component properties, variants, and layer structure
- The Figma component(s) must be published to a team library

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 1: Parse the Figma URL and Discover Components

**IMPORTANT:** Convert node IDs from URL format (`1-2`) to colon format (`1:2`) for all MCP tool calls.

Parse the provided Figma URL to extract the file key and node ID:
- URL format: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
- Extract `fileKey` (segment after `/design/`)
- Extract node ID from `node-id` parameter, convert hyphens to colons

**For single component requests:** Proceed directly to Step 1b.

**For batch/multi-component requests:** Use `get_metadata` to discover all components in the frame or page:

```
get_metadata(fileKey=":fileKey", nodeId="1:2")
```

This returns the node tree. Identify all `<symbol>` nodes — these are Figma components. Build a list of components to process, tracking:
- Component name
- Node ID
- Processing status (pending/done/skipped)

Then run Steps 1b through 6 for each component before moving to the next. After all components are processed, present a summary (see Step 7).

### Step 1b: Gather Component Information

Before writing any Code Connect file, you must understand both the code component and the Figma component.

**For the Figma component — use the Figma MCP:**

Always use the MCP tools to get accurate property information. Do not guess property names.

1. Run `get_design_context` to fetch full component details:
```
get_design_context(fileKey=":fileKey", nodeId="1:2")
```

2. From the response, extract:
   - **Variant properties** (enums): property name and all option values
   - **Boolean properties**: property name and what they control
   - **String properties**: property name
   - **Instance-swap properties**: property name and what components can be swapped in
   - **Layer hierarchy**: child instances, text layers, and their names

3. If the response is too large or truncated, use `get_metadata` first to get the node tree, then fetch specific child nodes individually.

4. If any property information is ambiguous or unclear from the MCP response, **ask the user** rather than guessing. You are the domain expert — it's better to clarify than to produce incorrect property mappings.

**Supplementary information:** The user may also provide screenshots, documentation, or manually describe properties. Use these to supplement (not replace) what the MCP provides.

**For the code component:**

1. Read the component file to understand its props interface
2. Identify all props, their types, and default values
3. Note the component's import path
4. Check for sub-components that may need separate connections
5. If the user hasn't specified a component file, scan the codebase for matching components:
   - Search for files with names matching the Figma component name
   - Check common paths: `src/components/`, `components/`, `lib/ui/`, `app/components/`
   - Present candidates to the user if multiple matches are found

### Step 2: Create the Property Mapping Plan

Before writing code, plan how each Figma property maps to a code prop. Cross-reference the Figma properties (from MCP) with the code component's props interface to find the best mappings. Present this plan to the user.

**Mapping decisions to make for each Figma property:**

| Figma Property Type | Code Connect Helper | When to Use |
|---|---|---|
| String input | `figma.string('Name')` | Text labels, titles, placeholders |
| Boolean toggle | `figma.boolean('Name')` | Simple true/false props |
| Boolean controlling visibility | `figma.boolean('Name', { true: ..., false: undefined })` | Conditional rendering |
| Boolean mapping to components | `figma.boolean('Name', { true: <A/>, false: <B/> })` | Swapping between two elements |
| Variant/Dropdown | `figma.enum('Name', { ... })` | Mapping variant options to code values |
| Instance swap | `figma.instance('Name')` | Nested component references |
| Child layer (not property-bound) | `figma.children('LayerName')` | Fixed child instances |
| Text override | `figma.textContent('LayerName')` | Text set by instance override, not prop |
| CSS classes from variants | `figma.className([...])` | Utility-class-based styling |
| Nested component props | `figma.nestedProps('LayerName', {...})` | Surfacing child props at parent level |

**Also determine:**
- Whether variant restrictions are needed (one Figma component = multiple code components)
- Whether multiple `figma.connect` calls are needed for the same URL
- Which child components need their own separate `figma.connect` calls

### Step 3: Write the Code Connect File

Create the `.figma.tsx` (React) or `.figma.ts` (Web Components) file.

**File naming convention:** `ComponentName.figma.tsx`

**IMPORTANT rules:**
- Import `figma` from `'@figma/code-connect/react'` for React or `from '@figma/code-connect/html'` for Web Components
- Import the actual component from the codebase
- Figma property names must match EXACTLY (case-sensitive, including spaces)
- Enum keys must match Figma variant option names EXACTLY
- The `example` function should return realistic, copy-paste-ready code
- Code Connect files are NOT executed — they are parsed as templates

**React template:**

```tsx
import figma from '@figma/code-connect/react'
import { ComponentName } from './ComponentName'

figma.connect(ComponentName, 'https://figma.com/design/:fileKey/:fileName?node-id=X-Y', {
  props: {
    // Property mappings here
  },
  example: (props) => {
    return (
      <ComponentName {...relevantProps}>
        {children}
      </ComponentName>
    )
  },
})
```

**Web Components template:**

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://figma.com/design/:fileKey/:fileName?node-id=X-Y', {
  props: {
    // Property mappings here
  },
  example: (props) => html`\
<component-name attr="${props.attr}">
  ${props.content}
</component-name>`,
})
```

### Step 4: Handle Complex Patterns

Apply these patterns based on the component's needs:

#### Boolean with conditional visibility

When a boolean toggle like "Has Label" controls whether a text property appears:

```tsx
props: {
  label: figma.boolean('Has label', {
    true: figma.string('Label'),
    false: undefined,
  }),
}
```

#### Enum mapping to different sub-components

When a variant option should render a specific child component:

```tsx
props: {
  cancelButton: figma.enum('Type', {
    Cancellable: <CancelButton />,
  }),
}
```

#### Variant restrictions for one-to-many mapping

When one Figma component maps to multiple code components, create multiple `figma.connect` calls with the SAME Figma URL:

```tsx
figma.connect(PrimaryButton, 'https://...SAME_URL...', {
  variant: { Type: 'Primary' },
  example: () => <PrimaryButton />,
})

figma.connect(SecondaryButton, 'https://...SAME_URL...', {
  variant: { Type: 'Secondary' },
  example: () => <SecondaryButton />,
})
```

#### Instance children with wildcard

When child layer names vary across variants:

```tsx
props: {
  icon: figma.children('*'),
}
```

#### Nested props

When you need to access a child component's properties at the parent level:

```tsx
props: {
  labelProps: figma.nestedProps('Label', {
    text: figma.string('Text'),
    bold: figma.boolean('Bold'),
  }),
}
```

#### className mapping

When the component uses utility classes:

```tsx
props: {
  className: figma.className([
    figma.enum('Size', { Small: 'sm', Large: 'lg' }),
    figma.boolean('Rounded', { true: 'rounded', false: '' }),
  ]),
}
```

#### Icon patterns with getProps() and render()

When you need to access icon properties from a parent component:

```tsx
// Using getProps to access child props
props: {
  iconProps: figma.instance("Icon").getProps<{ iconId: string }>()
},
example: ({ iconProps }) => <Button iconId={iconProps.iconId} />

// Using render for conditional rendering with child props
props: {
  icon: figma.boolean("Show icon", {
    true: figma.instance("Icon").render<{ name: string }>(
      p => <ButtonIcon name={p.name} />
    ),
  }),
}
```

### Step 5: Identify Required Child Connections

**IMPORTANT:** Any component used via `figma.instance` or `figma.children` MUST have its own `figma.connect` call. List all child components that need separate Code Connect files and offer to create them.

### Step 6: Validate and Review

Before presenting the final file:

1. Verify all Figma property names are spelled correctly
2. Verify all enum option names match Figma exactly
3. Ensure imports are correct
4. Check that the example returns realistic, usable code
5. Confirm all nested instances have (or will have) their own connections
6. Verify the Figma URL is correct and includes the node ID

### Step 7: Batch Summary (multi-component only)

When processing multiple components, provide a summary after all are complete:

```
Code Connect Summary:
- Total components found: 8
- Successfully created: 5
  - Button (42:15) → src/components/Button.figma.tsx
  - Card (42:20) → src/components/Card.figma.tsx
  - Input (42:25) → src/components/Input.figma.tsx
  - Badge (42:30) → src/components/Badge.figma.tsx
  - Avatar (42:35) → src/components/Avatar.figma.tsx
- Skipped (already connected): 2
  - Icon (42:40)
  - Tooltip (42:45)
- Could not connect: 1
  - CustomWidget (42:50) — No matching code component found
- Child components needing separate connections:
  - Icon (used by Button, Card)
  - Avatar (used by Card)
```

Also remind the user to run `npx figma connect publish` when they're ready to push the snippets to Dev Mode.

## Examples

### Example 1: Simple Button with all prop types

**Figma properties:** Label (string), Disabled (boolean), Type (enum: Primary/Secondary), Has Icon (boolean), Icon (instance swap)

```tsx
import figma from '@figma/code-connect/react'
import { Button } from './Button'

figma.connect(Button, 'https://figma.com/design/abc123/DS?node-id=42-15', {
  props: {
    label: figma.string('Label'),
    disabled: figma.boolean('Disabled'),
    type: figma.enum('Type', {
      Primary: 'primary',
      Secondary: 'secondary',
    }),
    icon: figma.boolean('Has Icon', {
      true: figma.instance('Icon'),
      false: undefined,
    }),
  },
  example: ({ disabled, label, type, icon }) => {
    return (
      <Button disabled={disabled} type={type} icon={icon}>
        {label}
      </Button>
    )
  },
})
```

### Example 2: Component with variant restrictions

**Figma:** Single Button component with Type variant (Primary/Secondary/Danger)
**Code:** Three separate components

```tsx
import figma from '@figma/code-connect/react'
import { PrimaryButton } from './PrimaryButton'
import { SecondaryButton } from './SecondaryButton'
import { DangerButton } from './DangerButton'

figma.connect(PrimaryButton, 'https://figma.com/design/abc123/DS?node-id=42-15', {
  variant: { Type: 'Primary' },
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }) => <PrimaryButton>{label}</PrimaryButton>,
})

figma.connect(SecondaryButton, 'https://figma.com/design/abc123/DS?node-id=42-15', {
  variant: { Type: 'Secondary' },
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }) => <SecondaryButton>{label}</SecondaryButton>,
})

figma.connect(DangerButton, 'https://figma.com/design/abc123/DS?node-id=42-15', {
  variant: { Type: 'Danger' },
  props: {
    label: figma.string('Label'),
  },
  example: ({ label }) => <DangerButton>{label}</DangerButton>,
})
```

### Example 3: Modal with enum-based children and instances

```tsx
import figma from '@figma/code-connect/react'
import { Modal } from './Modal'
import { CancelButton } from './CancelButton'

figma.connect(Modal, 'https://figma.com/design/abc123/DS?node-id=10-5', {
  props: {
    title: figma.string('Title'),
    content: figma.children('Content'),
    cancelButton: figma.enum('Type', {
      Cancellable: <CancelButton />,
    }),
  },
  example: ({ title, content, cancelButton }) => {
    return (
      <Modal>
        <Modal.Title>{title}</Modal.Title>
        <Modal.Content>{content}</Modal.Content>
        {cancelButton}
      </Modal>
    )
  },
})
```

### Example 4: Card with textContent and className

```tsx
import figma from '@figma/code-connect/react'
import { Card } from './Card'

figma.connect(Card, 'https://figma.com/design/abc123/DS?node-id=20-3', {
  props: {
    title: figma.textContent('Card Title'),
    description: figma.textContent('Card Description'),
    className: figma.className([
      figma.enum('Variant', {
        Elevated: 'card-elevated',
        Outlined: 'card-outlined',
        Filled: 'card-filled',
      }),
      figma.enum('Size', {
        Small: 'card-sm',
        Medium: 'card-md',
        Large: 'card-lg',
      }),
    ]),
    image: figma.children('Image'),
  },
  example: ({ title, description, className, image }) => (
    <Card className={className}>
      {image}
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card>
  ),
})
```

### Example 5: Web Component with boolean and enum

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://figma.com/design/abc123/DS?node-id=5-10', {
  props: {
    label: figma.string('Label'),
    variant: figma.enum('Variant', {
      Primary: 'primary',
      Secondary: 'secondary',
    }),
    disabled: figma.boolean('Disabled'),
    icon: figma.boolean('Has Icon', {
      true: html`<ds-icon name="check"></ds-icon>`,
      false: undefined,
    }),
  },
  example: ({ label, variant, disabled, icon }) => html`\
<ds-button variant="${variant}" ?disabled="${disabled}">
  ${icon}
  ${label}
</ds-button>`,
})
```

### Example 6: Batch processing multiple components

User says: "Create code connect files for all the components in this frame: https://figma.com/design/abc123/DS?node-id=1-0"

**Actions:**

1. Parse URL: fileKey=`abc123`, nodeId=`1-0` → convert to `1:0`
2. Run `get_metadata(fileKey="abc123", nodeId="1:0")` to discover all components
3. Metadata returns 4 `<symbol>` nodes: Button (42:15), Card (42:20), Input (42:25), Badge (42:30)
4. For each component:
   a. Run `get_design_context` to get properties and structure
   b. Scan codebase for matching component
   c. Present mapping plan to user
   d. Write the `.figma.tsx` file
5. Track child instances discovered (e.g., Icon used by Button and Card)
6. Offer to create Code Connect files for child components too
7. Present final summary

**Key:** Process components one at a time, confirming each with the user before moving to the next. For large batches, the user may say "go ahead with all" — in that case, proceed without individual confirmations but still present the final summary.

## Common Issues and Solutions

### Issue: Property name mismatch

**Cause:** The string passed to helpers doesn't exactly match the Figma property name.
**Solution:** Property names are case-sensitive and must include spaces. Check the Figma component's properties panel. "Has icon" is NOT the same as "Has Icon" or "hasIcon".

### Issue: Enum key mismatch

**Cause:** Enum mapping keys don't match the Figma variant option names.
**Solution:** Keys must match exactly. If Figma shows "Primary", use `Primary:` not `primary:` as the key.

### Issue: Code snippet not appearing in Dev Mode

**Cause:** Files haven't been published, or the component isn't published to a team library.
**Solution:** Run `npx figma connect publish --token=TOKEN`. Ensure the Figma component is published to a team library.

### Issue: Nested instance shows generic code instead of connected snippet

**Cause:** The nested component doesn't have its own `figma.connect` call.
**Solution:** Create a separate Code Connect file for the nested component. Every instance used via `figma.instance` or `figma.children` needs its own connection.

### Issue: Boolean variant not mapping correctly

**Cause:** Using `figma.enum` instead of `figma.boolean` for a two-option variant, or vice versa.
**Solution:** `figma.boolean` normalizes "Yes"/"No", "True"/"False", "On"/"Off" to `true`/`false`. If the variant has other labels, use `figma.enum` instead.

### Issue: Layer name not found for figma.children

**Cause:** Using a Figma property name instead of a layer name, or the layer was renamed.
**Solution:** `figma.children` takes the layer name from the component's layer hierarchy, NOT a property name. Check the Figma layers panel. Use `figma.children('*')` if layer names vary across variants.

### Issue: Import paths are wrong in published snippets

**Cause:** Code Connect auto-generates imports based on relative paths.
**Solution:** Configure `importPaths` in `figma.config.json` to override import paths, or use the `imports` option in `figma.connect` to specify exact imports.

## Decision Framework

Use this to determine which helper to use:

```
Is it a Figma property (shown in the properties panel)?
├── Yes
│   ├── Is it a string input? → figma.string()
│   ├── Is it a boolean toggle?
│   │   ├── Maps directly to a boolean prop? → figma.boolean('Name')
│   │   ├── Controls visibility of another prop? → figma.boolean('Name', { true: figma.string('X'), false: undefined })
│   │   └── Maps to two different elements? → figma.boolean('Name', { true: <A/>, false: <B/> })
│   ├── Is it a variant/enum dropdown?
│   │   ├── Maps to string values? → figma.enum('Name', { Key: 'value' })
│   │   ├── Maps to different components? → figma.enum('Name', { Key: <Component/> })
│   │   └── One Figma component = many code components? → variant restrictions
│   └── Is it an instance swap? → figma.instance('Name')
├── No — Is it a layer in the hierarchy?
│   ├── Is it a text layer whose content changes? → figma.textContent('LayerName')
│   ├── Is it a child instance (not bound to a prop)? → figma.children('LayerName')
│   └── Is it a nested component whose props you need? → figma.nestedProps('LayerName', {...})
└── Is it styling/classes from multiple properties? → figma.className([...])
```

## Additional Resources

- [Code Connect React Documentation](https://developers.figma.com/docs/code-connect/react/)
- [Code Connect Web Components Documentation](https://developers.figma.com/docs/code-connect/web-components/)
- [Code Connect CLI Getting Started](https://developers.figma.com/docs/code-connect/quickstart-guide/)
- [Code Connect Configuration](https://developers.figma.com/docs/code-connect/api/config-file/)
- Reference: `references/code-connect-reference.md`
