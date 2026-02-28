# Figma Code Connect - Comprehensive Reference

This document is the authoritative reference for Figma Code Connect. It covers all helper functions, patterns, and concepts needed to create `.figma.tsx` (React) or `.figma.ts` (Web Components) files that map Figma design components to code.

## Table of Contents

1. [What is Code Connect?](#what-is-code-connect)
2. [Setup and Configuration](#setup-and-configuration)
3. [figma.connect()](#figmaconnect)
4. [Property Mapping Helpers](#property-mapping-helpers)
   - [figma.string()](#figmastring)
   - [figma.boolean()](#figmaboolean)
   - [figma.enum()](#figmaenum)
   - [figma.instance()](#figmainstance)
   - [figma.children()](#figmachildren)
   - [figma.textContent()](#figmatextcontent)
   - [figma.className()](#figmaclassname)
   - [figma.nestedProps()](#figmanestedprops)
5. [Variant Restrictions](#variant-restrictions)
6. [Layer Mappings](#layer-mappings)
7. [React Examples](#react-examples)
8. [Web Component Examples](#web-component-examples)
9. [CLI Commands](#cli-commands)
10. [Configuration File](#configuration-file)
11. [Best Practices](#best-practices)

---

## What is Code Connect?

Code Connect links Figma design components to their code implementations. When a developer inspects a component in Figma's Dev Mode, they see the actual code snippet for that component rather than auto-generated CSS. This bridges the gap between design and development.

**Key benefits:**
- Designers see which code component implements a Figma component
- Developers navigate from Figma designs directly to the code
- Teams maintain a single source of truth for component mappings
- Dev Mode shows real, usable code snippets instead of generic markup

**Important:** Code Connect only works with components published to a team library. Unpublished components cannot be connected.

---

## Setup and Configuration

### Installation

```bash
npm install --global @figma/code-connect@latest
```

### Project dependencies

For React projects, install the Code Connect package:

```bash
npm install @figma/code-connect
```

### Authentication

Generate a personal access token with:
- **Code Connect** scope set to **Write**
- **File content** scope set to **Read**

Set via environment variable or CLI flag:
```bash
export FIGMA_ACCESS_TOKEN=your_token_here
# or
npx figma connect --token=your_token_here
```

### Code Connect file naming convention

```
ComponentName.figma.tsx    # React
ComponentName.figma.ts     # Web Components / HTML
```

---

## figma.connect()

The core function that establishes a connection between a code component and a Figma component.

### React syntax

```tsx
import figma from '@figma/code-connect/react'
import { Button } from './Button'

figma.connect(Button, 'https://figma.com/design/:fileKey/:fileName?node-id=1-2', {
  props: {
    // property mappings
  },
  example: (props) => {
    return <Button {...props} />
  },
})
```

### Web Components / HTML syntax

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://figma.com/design/:fileKey/:fileName?node-id=1-2', {
  props: {
    // property mappings
  },
  example: (props) => html`<ds-button></ds-button>`,
})
```

### Key differences between React and Web Components

| Aspect | React | Web Components |
|--------|-------|----------------|
| Import | `from '@figma/code-connect/react'` | `from '@figma/code-connect/html'` |
| First arg to `figma.connect` | Component reference (e.g., `Button`) | Omitted (just URL) |
| Example return | JSX (`<Button />`) | Tagged template literal (`html\`...\``) |
| Nested components in enums | JSX (`<CancelButton />`) | `html\`<ds-cancel-button></ds-cancel-button>\`` |

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `component` | Component (React only) | The imported code component |
| `figmaNodeUrl` | string | URL to the Figma component node |
| `config.props` | object | Property mappings (see helpers below) |
| `config.example` | function | Returns the code snippet shown in Dev Mode |
| `config.variant` | object | Variant restrictions (see section below) |
| `config.imports` | string[] | Override auto-generated imports |
| `config.links` | object[] | Links shown alongside the snippet |

---

## Property Mapping Helpers

### figma.string()

Maps a Figma string property (text input) to a code prop.

```tsx
// Maps the Figma property "Text Content" to the code prop `label`
props: {
  label: figma.string('Text Content'),
}
```

The Figma property name (e.g., `'Text Content'`) must match exactly what appears in the Figma component's property panel.

---

### figma.boolean()

Maps a Figma boolean property to a code prop. Supports three patterns:

#### Simple boolean mapping

Directly maps a Figma boolean toggle to a code boolean prop:

```tsx
// Simple mapping of boolean from Figma to code
props: {
  disabled: figma.boolean('Disabled'),
}
// When "Disabled" is true in Figma → disabled={true}
// When "Disabled" is false in Figma → disabled={false}
```

#### Boolean with value mapping

Maps a boolean to different values for true and false:

```tsx
// Map a boolean value to one of two options of any type
props: {
  icon: figma.boolean('Has Icon', {
    true: <Icon />,
    false: <Spacer />,
  }),
}
```

#### Conditional rendering (partial mapping with undefined)

Only renders a prop when the boolean matches a specific value. Setting a value to `undefined` means it won't be rendered:

```tsx
// Don't render the prop if 'Has label' in Figma is false
props: {
  label: figma.boolean('Has label', {
    true: figma.string('Label'),
    false: undefined,
  }),
}
```

This is very common for conditional visibility patterns where a boolean toggle like "Has label" controls whether a text property should be shown.

#### Web Components boolean example

```ts
props: {
  disabled: figma.boolean('Disabled'),
  icon: figma.boolean('Has Icon', {
    true: html`<ds-icon></ds-icon>`,
    false: undefined,
  }),
}
```

---

### figma.enum()

Maps a Figma variant property (dropdown/enum) to code values.

#### Simple enum mapping (string values)

```tsx
props: {
  type: figma.enum('Type', {
    Primary: 'primary',
    Secondary: 'secondary',
    Danger: 'danger',
  }),
}
```

The keys (e.g., `Primary`, `Secondary`) must match the Figma variant option names exactly. The values (e.g., `'primary'`) are what appear in the code snippet.

#### Enum mapping to JSX components (React)

Enum values can be JSX elements, useful for mapping variants to different sub-components:

```tsx
// Enum mappings can show a component based on a Figma variant
props: {
  cancelButton: figma.enum('Type', {
    Cancellable: <CancelButton />,
  }),
},
example: ({ cancelButton }) => {
  return (
    <Modal>
      <Title>Title</Title>
      <Content>Some content</Content>
      {cancelButton}
    </Modal>
  )
},
```

When the Figma variant "Type" is set to "Cancellable", the cancel button component renders. For other variant values not listed, `cancelButton` will be `undefined`.

#### Enum mapping to HTML (Web Components)

```ts
props: {
  cancelButton: figma.enum('Type', {
    Cancellable: html`<ds-cancel-button></ds-cancel-button>`,
  }),
},
example: ({ cancelButton }) => html`\
<ds-modal>
  <ds-modal-title>Title</ds-modal-title>
  <ds-modal-content>Some content</ds-modal-content>
  ${cancelButton}
</ds-modal>`
```

#### Partial enum mapping

You don't need to map every variant option. Unmapped options resolve to `undefined`:

```tsx
props: {
  // Only map some variants; others will be undefined
  size: figma.enum('Size', {
    Large: 'lg',
    Medium: 'md',
    // "Small" variant not mapped — will be undefined
  }),
}
```

---

### figma.instance()

Maps a Figma instance-swap property to a code prop. "Instances" are Figma's term for nested component references (e.g., a Button containing an Icon as a nested component).

The return value of `figma.instance` is a JSX component (React) or HTML (Web Components) and can be used like a typical prop.

```tsx
// Maps an instance-swap property from Figma
props: {
  icon: figma.instance('Icon'),
},
example: ({ icon }) => {
  return <Button icon={icon}>Instance prop Example</Button>
},
```

When `figma.instance` is used, Dev Mode automatically populates the referenced component's connected code snippet with the instance code that matches the properties.

**Important:** To ensure instance properties work well, implement Code Connect for all common components that you would expect to be used as values for a given property.

#### Web Components instance example

```ts
props: {
  icon: figma.instance('Icon'),
},
example: ({ icon }) => html`<ds-button>${icon}</ds-button>`,
```

---

### figma.children()

Renders code snippets for child instances that are NOT bound to an instance-swap prop. Unlike `figma.instance`, which maps to a specific property, `figma.children` maps to a layer by its name within the parent component.

**Important:** `figma.children` takes the **name of the instance layer within the parent component** as its parameter, NOT a Figma prop name.

#### Layer hierarchy example

Consider a component with this structure:
```
Button (Component)
    Icon (Instance)
```

Here, "Icon" is the original name of the layer and the value you should pass to `figma.children()`.

```tsx
props: {
  icon: figma.children('Icon'),
},
example: ({ icon }) => {
  return <Button>{icon}</Button>
},
```

#### Renamed layers

If an instance layer is renamed:
```
Button (Instance)
    RenamedIcon (Instance)
```

Renaming the layer won't break the mapping since `figma.children` uses the original component name, not the renamed layer name. However, if the layer is renamed in the **component definition** (not an instance), you need to update the children reference.

#### Wildcard children

Layer names may differ between variants in a component set. Use the wildcard `"*"` to match any layer:

```tsx
props: {
  icon: figma.children('*'),
},
```

This ensures the component can render a nested instance for any variant, regardless of the layer name.

#### Multiple children

You can map multiple child layers:

```tsx
props: {
  icon: figma.children('Icon'),
  badge: figma.children('Badge'),
},
example: ({ icon, badge }) => {
  return (
    <Button>
      {icon}
      {badge}
    </Button>
  )
},
```

#### Collect all children with wildcard array

```tsx
props: {
  items: figma.children(['*']),
},
example: ({ items }) => {
  return <List>{items}</List>
},
```

**Important:** The nested instance must also be connected separately with its own `figma.connect` call.

---

### figma.textContent()

Selects a child text layer and renders its content. A common pattern in Figma design systems is to not use props for texts, but rather rely on instances overriding the text content.

Takes the **name of the text layer in the original component** as its parameter.

```tsx
figma.connect(Button, "https://...", {
  props: {
    label: figma.textContent("Text Layer"),
  },
  example: ({ label }) => <Button>{label}</Button>,
})
```

This captures whatever text the designer has entered in the "Text Layer" layer and uses it in the code snippet.

---

### figma.className()

Maps Figma properties to CSS class names. Useful for utility-class-based styling (Tailwind, BEM, etc.).

```tsx
props: {
  className: figma.className([
    figma.enum('Size', {
      Small: 'btn-sm',
      Medium: 'btn-md',
      Large: 'btn-lg',
    }),
    figma.boolean('Rounded', {
      true: 'btn-rounded',
      false: '',
    }),
  ]),
},
example: ({ className }) => {
  return <button className={className}>Click me</button>
},
```

`figma.className` takes an array of `figma.enum` and/or `figma.boolean` calls and concatenates the resulting class names.

---

### figma.nestedProps()

Accesses properties of a nested Figma component instance. Useful when a component contains another component whose properties you want to surface directly.

```tsx
props: {
  labelProps: figma.nestedProps('Label', {
    text: figma.string('Text'),
    bold: figma.boolean('Bold'),
  }),
},
example: ({ labelProps }) => {
  return (
    <Input>
      <Label bold={labelProps.bold}>{labelProps.text}</Label>
    </Input>
  )
},
```

`figma.nestedProps` takes two arguments:
1. The name of the nested instance layer
2. An object mapping the nested component's Figma properties to code values (using the same helpers: `figma.string`, `figma.boolean`, `figma.enum`, etc.)

---

## Variant Restrictions

Sometimes a component in Figma is represented by more than one component in code. For example, a single `Button` in Figma with a `Type` property (Primary, Secondary, Danger) may map to three separate code components: `PrimaryButton`, `SecondaryButton`, and `DangerButton`.

Use **variant restrictions** to provide different code samples for different variants of a single Figma component.

```tsx
figma.connect(PrimaryButton, 'https://...', {
  variant: { Type: 'Primary' },
  example: () => <PrimaryButton />,
})

figma.connect(SecondaryButton, 'https://...', {
  variant: { Type: 'Secondary' },
  example: () => <SecondaryButton />,
})

figma.connect(DangerButton, 'https://...', {
  variant: { Type: 'Danger' },
  example: () => <DangerButton />,
})
```

**Important:** The keys and values in the `variant` object must match the name of the variant property and its options in Figma exactly.

All three `figma.connect` calls use the **same Figma URL** (pointing to the same component), but each is restricted to a specific variant. When a designer selects a variant in Figma, only the matching code snippet appears in Dev Mode.

### Web Components variant restrictions

```ts
figma.connect('https://...', {
  variant: { Type: 'Primary' },
  example: () => html`<ds-primary-button></ds-primary-button>`,
})

figma.connect('https://...', {
  variant: { Type: 'Secondary' },
  example: () => html`<ds-secondary-button></ds-secondary-button>`,
})
```

---

## Layer Mappings

Layer mappings allow you to connect code to specific layers within a Figma component. This is useful for complex components where different layers map to different code constructs.

### How layers work in Figma

Components in Figma have a layer hierarchy. Each layer has:
- A **name** (visible in the layers panel)
- A **type** (frame, text, instance, etc.)
- **Properties** that may differ between variants

### Mapping to layers with figma.children

The primary way to map layers is via `figma.children()`:

```tsx
// Map a specific named layer
props: {
  header: figma.children('Header'),
  body: figma.children('Body'),
  footer: figma.children('Footer'),
},
example: ({ header, body, footer }) => (
  <Card>
    {header}
    {body}
    {footer}
  </Card>
),
```

### Layer names vs. property names

- `figma.string('Prop Name')`, `figma.boolean('Prop Name')`, `figma.enum('Prop Name')` — reference **Figma property names** from the component's properties panel
- `figma.children('Layer Name')` — references the **layer name** within the component's layer hierarchy
- `figma.textContent('Layer Name')` — references a **text layer name** within the component

### Handling layer name variations across variants

Different variants of a component may have differently named layers. Use `figma.children('*')` wildcard to handle this:

```tsx
props: {
  icon: figma.children('*'),  // Matches any single child layer
},
```

---

## React Examples

### Full Button component example

```tsx
import figma from '@figma/code-connect/react'
import { Button } from './Button'

figma.connect(Button, 'https://...', {
  props: {
    label: figma.string('Text Content'),
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

### Modal with variant-based children

```tsx
import figma from '@figma/code-connect/react'
import { Modal } from './Modal'
import { CancelButton } from './CancelButton'

figma.connect(Modal, 'https://...', {
  props: {
    cancelButton: figma.enum('Type', {
      Cancellable: <CancelButton />,
    }),
    title: figma.string('Title'),
    content: figma.children('Content'),
  },
  example: ({ cancelButton, title, content }) => {
    return (
      <Modal>
        <Title>{title}</Title>
        {content}
        {cancelButton}
      </Modal>
    )
  },
})
```

### Component with className mapping

```tsx
import figma from '@figma/code-connect/react'

figma.connect(Badge, 'https://...', {
  props: {
    className: figma.className([
      figma.enum('Variant', {
        Success: 'badge-success',
        Warning: 'badge-warning',
        Error: 'badge-error',
      }),
      figma.enum('Size', {
        Small: 'badge-sm',
        Large: 'badge-lg',
      }),
    ]),
    label: figma.string('Label'),
  },
  example: ({ className, label }) => (
    <span className={className}>{label}</span>
  ),
})
```

### Component with nested props

```tsx
import figma from '@figma/code-connect/react'
import { FormField } from './FormField'

figma.connect(FormField, 'https://...', {
  props: {
    inputProps: figma.nestedProps('Input', {
      placeholder: figma.string('Placeholder'),
      disabled: figma.boolean('Disabled'),
      type: figma.enum('Type', {
        Text: 'text',
        Password: 'password',
        Email: 'email',
      }),
    }),
    label: figma.string('Label'),
  },
  example: ({ inputProps, label }) => (
    <FormField label={label}>
      <Input
        placeholder={inputProps.placeholder}
        disabled={inputProps.disabled}
        type={inputProps.type}
      />
    </FormField>
  ),
})
```

---

## Web Component Examples

### Basic Web Component

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://...', {
  props: {
    label: figma.string('Label'),
    variant: figma.enum('Variant', {
      Primary: 'primary',
      Secondary: 'secondary',
    }),
    disabled: figma.boolean('Disabled'),
  },
  example: ({ label, variant, disabled }) => html`\
<ds-button variant="${variant}" ?disabled="${disabled}">
  ${label}
</ds-button>`,
})
```

### Web Component with enum rendering sub-components

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://...', {
  props: {
    cancelButton: figma.enum('Type', {
      Cancellable: html`<ds-cancel-button></ds-cancel-button>`,
    }),
  },
  example: ({ cancelButton }) => html`\
<ds-modal>
  <ds-modal-title>Title</ds-modal-title>
  <ds-modal-content>Some content</ds-modal-content>
  ${cancelButton}
</ds-modal>`,
})
```

### Web Component with boolean conditional

```ts
import figma, { html } from '@figma/code-connect/html'

figma.connect('https://...', {
  props: {
    icon: figma.boolean('Has Icon', {
      true: html`<ds-icon name="check"></ds-icon>`,
      false: undefined,
    }),
    label: figma.string('Label'),
  },
  example: ({ icon, label }) => html`\
<ds-button>
  ${icon}
  ${label}
</ds-button>`,
})
```

---

## CLI Commands

### Interactive setup

```bash
npx figma connect --token=TOKEN
```

Walks through connecting components interactively.

### Publish

```bash
npx figma connect publish --token=TOKEN
```

Publishes all Code Connect files so snippets appear in Dev Mode.

### Unpublish

```bash
# Unpublish a specific node
npx figma connect unpublish --node=NODE_URL --label=LABEL

# Unpublish all (caution!)
npx figma connect unpublish
```

### Create a Code Connect file

```bash
npx figma connect create FIGMA_URL --token=TOKEN
```

Scaffolds a new Code Connect file for a specific Figma component.

---

## Configuration File

`figma.config.json` in the project root:

```json
{
  "codeConnect": {
    "parser": "react",
    "include": ["src/components/**"],
    "exclude": ["test/**", "docs/**", "build/**"],
    "label": "React",
    "language": "tsx",
    "importPaths": {
      "src/components/*": "@ui/components"
    },
    "paths": {
      "@ui/components/*": ["src/components/*"]
    },
    "interactiveSetupFigmaFileUrl": "https://www.figma.com/design/abc123/my-design-system",
    "documentUrlSubstitutions": {
      "https://figma.com/design/old-key/File": "https://figma.com/design/new-key/File"
    }
  }
}
```

### Key configuration options

| Option | Description |
|--------|-------------|
| `parser` | Override project type detection: `react`, `html`, `swift`, `compose` |
| `include` | Glob patterns for Code Connect file locations |
| `exclude` | Glob patterns to exclude |
| `label` | Label shown in Dev Mode (e.g., "React", "Vue") |
| `language` | Syntax highlighting language |
| `importPaths` | Override import paths for component imports |
| `paths` | TypeScript path alias resolution (matches tsconfig) |
| `imports` | Override generated import statements |
| `interactiveSetupFigmaFileUrl` | Default Figma file for interactive setup |
| `documentUrlSubstitutions` | URL substitutions for multi-file setups |

---

## Best Practices

### 1. Match Figma property names exactly
Property names passed to helpers (`figma.string('Name')`, `figma.enum('Type')`, etc.) must match the Figma component's property names exactly, including capitalization and spaces.

### 2. Connect all nested instances
When using `figma.instance` or `figma.children`, the nested component must also have its own `figma.connect` call. Otherwise, Dev Mode won't show useful code for the nested component.

### 3. Use variant restrictions for 1-to-many mappings
When one Figma component maps to multiple code components, use variant restrictions rather than complex conditional logic.

### 4. Prefer figma.children for non-property instances
Use `figma.instance` for instance-swap properties, and `figma.children` for fixed child instances that aren't bound to a property.

### 5. Use undefined for conditional rendering
When a boolean toggle controls visibility, map `false` to `undefined` to omit the prop entirely from the code snippet.

### 6. Keep examples realistic
The `example` function should return code that developers can copy-paste and use. Include realistic prop values and component structure.

### 7. Use figma.textContent for overrideable text
When text in Figma is set by overriding instance content (not via a property), use `figma.textContent` to capture it.

### 8. One Code Connect file per component
Follow the convention of `ComponentName.figma.tsx` alongside or near the component file.

### 9. Publish after changes
Always run `npx figma connect publish` after creating or modifying Code Connect files to update Dev Mode.

### 10. Component must be published to team library
Code Connect only works with components (or component sets) that have been published to a Figma team library. Local/unpublished components cannot be connected.

---

## Advanced Patterns

### Icon Mapping Strategies

There are three common patterns for connecting icons:

#### Icons as JSX elements

```tsx
// Icon Code Connect file
figma.connect("my-icon-url", {
  example: () => <IconHeart />
})

// Parent component using instance
figma.connect("my-button-url", {
  props: {
    icon: figma.instance("InstanceSwapPropName")
  },
  example: ({ icon }) => <Button>{icon}</Button>
})
// renders: <Button><IconHeart/></Button>
```

#### Icons as React Components (passed as props)

```tsx
// Icon Code Connect file
figma.connect("my-icon-url", {
  example: () => IconHeart  // Note: no JSX, just the component reference
})

// Parent component
figma.connect("my-button-url", {
  props: {
    Icon: figma.instance<React.FunctionComponent>("InstanceSwapPropName")
  },
  example: ({ Icon }) => <Button Icon={Icon} />
})
// renders: <Button Icon={IconHeart} />
```

#### Icons as strings

```tsx
// Icon Code Connect file
figma.connect("my-icon-url", {
  example: () => "icon-heart"  // Returns a string ID
})

// Parent component
figma.connect("my-button-url", {
  props: {
    iconId: figma.instance<string>("InstanceSwapPropName")
  },
  example: ({ iconId }) => <Button iconId={iconId} />
})
// renders: <Button iconId="icon-heart" />
```

### Accessing child props with getProps()

`figma.instance().getProps<T>()` gives access to the props of a child component from the parent. Static props are included in the returned object.

```tsx
// Icon Code Connect file
figma.connect("my-icon-url", {
  props: {
    iconId: "my-icon",  // Static prop
    size: figma.enum("Size", {
      'large': 'large',
      'small': 'small'
    })
  },
  example: ({ size }) => <MyIcon size={size}/>
})

// Parent component using getProps
figma.connect("icon-button-url", {
  props: {
    iconProps: figma.instance("InstanceSwapPropName").getProps<{iconId: string, size: "small" | "large"}>()
  },
  example: ({ iconProps }) => <IconButton iconId={iconProps.iconId} iconSize={iconProps.size} />
})
// renders: <IconButton iconId="my-icon" iconSize="small" />
```

### Conditional rendering with render()

`figma.instance().render<T>(fn)` allows conditional rendering of nested connected components. The function receives the resolved props.

```tsx
// Parent component using render
figma.connect("icon-button-url", {
  props: {
    icon: figma.boolean("Show icon", {
      true: figma.instance("InstanceSwapPropName").render<{iconId: string, size: "small" | "large"}>(
        props => <ButtonIcon id={props.iconId} size={props.size}/>
      ),
    }),
  },
  example: ({ icon }) => <Button icon={icon}/>
})
// renders: <Button icon={<ButtonIcon id="my-icon" size="small" />} />
```

### Nested boolean with nestedProps

A common pattern for accessing properties of a conditionally hidden layer:

```tsx
figma.connect(Button, "https://...", {
  props: {
    childProps: figma.boolean("showChild", {
      true: figma.nestedProps('Child', {
        label: figma.string("Label")
      }),
      false: { label: undefined }
    })
  },
  example: ({ childProps }) => <Button label={childProps.label} />
})
```

### Important Caveat: Code Connect files are NOT executed

While Code Connect files use real components from your codebase, the Figma CLI treats code snippets as **strings**. This means:
- You can use hooks without needing to mock data
- Logical operators like ternaries or conditionals will be output verbatim rather than executed
- You cannot dynamically construct `figma.connect` calls in a for-loop

### Nested references in enum and boolean mapping objects

Both `figma.enum` and `figma.boolean` allow nested references to other helpers:

```tsx
// Enum with nested figma.instance reference
figma.enum('Type', {
  WithIcon: figma.instance('Icon'),
  WithoutIcon: undefined,
})

// Boolean with nested figma.string reference
figma.boolean('Has label', {
  true: figma.string('Label'),
  false: undefined,
})
```

### Boolean Variants (Yes/No, On/Off)

`figma.boolean` can also map Figma Variants that have only two options like "Yes"/"No", "True"/"False", or "On"/"Off". These values are normalized to `true` and `false`:

```tsx
// These two are equivalent for a variant with options "Yes" and "No"
disabled: figma.enum("Boolean Variant", {
  Yes: true,
  No: false,
})
// is the same as
disabled: figma.boolean("Boolean Variant")
```

**Important:** For `figma.enum`, values are NOT normalized. You must pass exact literal values as keys.
