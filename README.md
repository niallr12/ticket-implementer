# Ticket Implementer

A web application that uses GitHub Copilot SDK to automatically implement Azure DevOps tickets. Paste a ticket URL, review the AI-generated implementation plan, and let Copilot write the code for you.

## Features

- **Fetch Azure DevOps Tickets** - Parse ticket details from any Azure DevOps work item URL
- **AI-Generated Plans** - Generate implementation plans using GitHub Copilot
- **Plan Refinement** - Refine plans with natural language feedback or edit directly
- **Multi-Model Support** - Choose from multiple models including Claude, GPT, and Gemini
- **Flexible Repository Options** - Clone from Azure DevOps or use an existing local folder
- **Real-time Streaming** - Watch implementation progress with Server-Sent Events
- **Code Refinement** - Refine implemented code with AI-powered feedback
- **Post-Implementation Tasks** - Run tests, linting, or custom commands before committing
- **Automatic PR Creation** - Creates a pull request with all changes (for remote repos)
- **CLI Tool** - Optional command-line interface with interactive chat for fetching tickets

## Architecture

```
┌─────────────────┐     HTTP/SSE      ┌─────────────────┐
│   React + Vite  │ ◄───────────────► │  Express Server │
│    Frontend     │                   │    Backend      │
└─────────────────┘                   └────────┬────────┘
                                               │
                                      ┌────────▼────────┐
                                      │  Copilot SDK    │
                                      │  + Azure DevOps │
                                      └─────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **GitHub Copilot CLI** - Must be installed and in your PATH
- **GitHub Copilot Subscription** - Active subscription linked to your GitHub account
- **Azure DevOps Account** - (Optional) For fetching tickets and using remote repositories

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ticket-implementer.git
cd ticket-implementer
```

### 2. Install dependencies

```bash
# Install server dependencies
npm install

# Install UI dependencies
cd ui && npm install && cd ..
```

### 3. (Optional) Create an Azure DevOps Personal Access Token

**Only required if you want to:**
- Fetch tickets from Azure DevOps
- Clone repositories from Azure DevOps
- Create pull requests in Azure DevOps

**To create a PAT:**

1. Go to your Azure DevOps organization's token settings:
   ```
   https://dev.azure.com/{your-org}/_usersSettings/tokens
   ```

2. Click **New Token** and configure:
   - **Name:** `ticket-implementer`
   - **Expiration:** Set as appropriate
   - **Scopes:** Select **Custom defined**, then enable:
     - **Work Items** → Read
     - **Code** → Read & Write

3. Click **Create** and copy the token

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your PAT (if using Azure DevOps):

```
ADO_PAT=your-personal-access-token-here
```

**Note:** You can use the application without an Azure DevOps PAT by working with local folders instead of remote repositories.

### 5. Authenticate with GitHub Copilot

```bash
github-copilot-cli auth
```

Follow the prompts to authenticate with your GitHub account.

## Running the Application

### Start the backend server

```bash
npm run server
# or
npx tsx server/index.ts
```

The server runs on `http://localhost:3001`

### Start the frontend (in a separate terminal)

```bash
cd ui
npm run dev
```

The UI runs on `http://localhost:5173`

### Open the application

Navigate to `http://localhost:5173` in your browser.

## Usage

### Web Application (Recommended)

1. **Enter Ticket URL** - Paste an Azure DevOps work item URL (e.g., `https://dev.azure.com/org/project/_workitems/edit/123`)
   - Or skip this and manually enter a description

2. **Choose Repository Source**:
   - **Remote (Azure DevOps)**: Enter repository URL to clone
   - **Local Folder**: Browse and select an existing local folder

3. **Review Implementation Plan** - The AI generates a summary and step-by-step plan
   - Edit the plan directly if needed
   - Use the "Refine Plan" feature to adjust with natural language feedback
   - Update the plan by modifying the text directly

4. **Select Model** - Choose which AI model to use for implementation

5. **Configure Post-Tasks** (optional) - Select tasks to run after implementation:
   - Run tests
   - Build project
   - Run linter
   - Custom commands

6. **Approve & Implement** - Watch as Copilot implements the changes in real-time
   - View streaming updates as code is written
   - See tool execution progress

7. **Review & Refine**:
   - View the diff of all changes made
   - Use "Refine Code" to make AI-powered adjustments
   - Commit and push changes (or create PR for remote repos)

### CLI Tool (Optional)

For a simpler interactive experience, use the CLI:

```bash
npx tsx index.ts
```

Features:
- Interactive chat interface
- Fetch Azure DevOps tickets by pasting URLs
- Get weather information (demo tool)
- Powered by GPT-4.1 with streaming responses

## Project Structure

```
├── server/
│   ├── index.ts              # Express server entry point
│   ├── routes/
│   │   └── ticket.ts         # API routes for ticket operations
│   └── services/
│       └── copilot.ts        # Copilot SDK service wrapper
├── ui/
│   ├── src/
│   │   ├── App.tsx           # Main React application
│   │   ├── components/       # React components
│   │   │   ├── TicketInput.tsx
│   │   │   ├── PlanReview.tsx
│   │   │   ├── Implementation.tsx
│   │   │   └── InstructionSelector.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── utils/
│   ├── azure-devops.ts       # Azure DevOps API client
│   └── azure-devops-git.ts   # Git operations & PR creation
├── index.ts                  # CLI tool (standalone)
├── package.json
└── .env                      # Environment configuration
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check endpoint |
| `/api/ticket/fetch` | POST | Fetch ticket details from Azure DevOps |
| `/api/ticket/plan` | POST | Generate implementation plan from ticket |
| `/api/ticket/refine` | POST | Refine plan with AI feedback |
| `/api/ticket/update-plan` | POST | Update plan with direct edits |
| `/api/ticket/clone` | POST | Clone repository from Azure DevOps |
| `/api/ticket/use-local` | POST | Use existing local folder |
| `/api/ticket/browse-folder` | GET | Browse local filesystem |
| `/api/ticket/implement` | POST | Execute implementation (SSE stream) |
| `/api/ticket/refine-code` | POST | Refine implemented code with AI |
| `/api/ticket/diff` | GET | Get git diff of changes |
| `/api/ticket/commit-push` | POST | Commit and push changes |
| `/api/ticket/create-pr` | POST | Create pull request in Azure DevOps |
| `/api/ticket/current` | GET | Get current ticket and plan state |
| `/api/ticket/repo-info` | GET | Get current repository information |
| `/api/ticket/shared-instructions` | GET | List available shared instructions |
| `/api/ticket/copy-instructions` | POST | Copy selected instructions to workspace |
| `/api/ticket/cleanup-instructions` | POST | Remove temporary instruction files |
| `/api/ticket/discuss` | POST | Discuss the plan with AI (Q&A) |
| `/api/ticket/discussion-history` | GET | Get current discussion history |
| `/api/ticket/clear-discussion` | POST | Clear discussion history |
| `/api/ticket/discuss-implementation` | POST | Discuss implementation code with AI |
| `/api/ticket/implementation-discussion-history` | GET | Get implementation discussion history |
| `/api/ticket/clear-implementation-discussion` | POST | Clear implementation discussion |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADO_PAT` | Azure DevOps Personal Access Token | Only for Azure DevOps features |
| `SHARED_INSTRUCTIONS_REPO` | URL to shared instructions repository | No |
| `PORT` | Server port (default: 3001) | No |

## Custom Instructions & Skills

This application loads custom instructions from repositories and injects them into Copilot sessions.

**Note:** The SDK does not auto-discover instructions - our code handles this manually.

### How It Works

When `workingDirectory` is set, the application:
1. Loads all `*.instructions.md` files from `.github/instructions/`
2. Injects them into the session via `systemMessage`

| Location | Handling |
|----------|----------|
| `.github/instructions/*.instructions.md` | Loaded and injected automatically |
| `.github/skills/` | Configured via `skillDirectories` |

### Creating Instruction Files

Create instruction files in `.github/instructions/` with the `.instructions.md` extension:

```markdown
---
applyTo: "**.ts, **.tsx"
description: "Coding standards for this project"
name: "Project Standards"
---

## Rules

- Use strict TypeScript mode
- Write tests for all new features
- Follow the existing code style
```

Instructions are automatically applied when the working directory is set during:
- Plan generation
- Plan refinement
- Implementation

For detailed documentation on custom instructions, skills, and MCP servers, see [docs/COPILOT-SDK-CUSTOMIZATION.md](docs/COPILOT-SDK-CUSTOMIZATION.md).

### Shared Instructions Library

You can configure a central Azure DevOps repository to share instruction files across projects. This allows teams to maintain a library of reusable coding standards, best practices, and project-specific guidelines.

#### Setup

1. Create a repository in Azure DevOps to store shared instructions
2. Create an `/instructions` folder in the repository root
3. Add instruction files with the `.instructions.md` extension
4. Set the `SHARED_INSTRUCTIONS_REPO` environment variable:

```bash
SHARED_INSTRUCTIONS_REPO=https://dev.azure.com/your-org/your-project/_git/shared-instructions
```

#### Repository Structure

```
shared-instructions/
└── instructions/
    ├── reactjs.instructions.md
    ├── typescript.instructions.md
    ├── testing-best-practices.instructions.md
    └── security-guidelines.instructions.md
```

#### How It Works

1. After cloning/selecting a repository, you'll see a "Shared Instructions" selector
2. Browse and search available instructions from your central repository
3. Select the instructions relevant to your current task
4. Selected instructions are temporarily copied to the workspace's `.github/instructions/` folder
5. The AI uses these instructions when generating plans and implementing code
6. Instructions are automatically cleaned up when you click "Done"

#### Key Features

- **Search & Filter**: Quickly find instructions by name or filename
- **Conflict Detection**: Instructions already in the workspace are marked and skipped
- **Non-Destructive**: Temporary files don't appear in git diff or get committed
- **Visual Indicators**: Selected instructions appear as pills for easy reference

### Figma Integration

The application automatically detects Figma links in ticket descriptions and integrates with Figma MCP for design-driven implementation.

#### How It Works

1. When you fetch an Azure DevOps ticket, the application scans the description for Figma URLs
2. If a Figma link is found, it's displayed prominently in the ticket details
3. The Figma URL is automatically included in the AI prompts for:
   - Plan generation (AI analyzes the design)
   - Plan refinement
   - Implementation (AI uses Figma MCP to extract design details)

#### Supported Figma URL Formats

- `https://www.figma.com/file/...`
- `https://www.figma.com/design/...`
- `https://www.figma.com/proto/...`
- `https://figma.com/file/...` (without www)

#### Setting Up Figma MCP

The application automatically connects to Figma's remote MCP server (`https://mcp.figma.com/mcp`) when a Figma URL is detected. To use it:

1. **First-time setup**: When the AI attempts to access Figma, you'll be prompted to authenticate via OAuth in your browser
2. **Authorize access**: Log in to your Figma account and authorize the MCP server to access your designs
3. **Done**: Once authenticated, the AI can access your private Figma files

The OAuth authentication is handled by Figma's MCP server - no API keys or tokens need to be configured manually.

Once authenticated, the AI will be able to:
- Fetch design specifications from Figma files (including private designs)
- Extract colors, typography, and spacing
- Understand component hierarchies
- Implement designs that match the Figma specifications exactly

#### Adding Figma Links to Tickets

Include Figma links anywhere in your Azure DevOps ticket description:

```
Implement the new dashboard widget as shown in the design:
https://www.figma.com/design/abc123/Dashboard-Redesign

Requirements:
- Match the layout exactly
- Use the specified color palette
- Implement responsive breakpoints
```

---

## How It Works

### Architecture Flow

1. **Frontend (React + Vite)**: User interface for ticket input, plan review, and implementation monitoring
2. **Backend (Express)**: REST API server that orchestrates the workflow
3. **Copilot SDK**: Interfaces with GitHub Copilot CLI to generate plans and implement code
4. **Azure DevOps APIs**: (Optional) Fetch ticket details and manage repositories

### Implementation Process

1. User provides ticket details (from Azure DevOps or manual entry)
2. Copilot generates an implementation plan based on ticket description
3. User reviews and optionally refines the plan
4. Repository is prepared (cloned from remote or using local folder)
5. Copilot implements the plan using streaming responses
6. Post-implementation tasks are executed (tests, linting, etc.)
7. Changes are reviewed, refined if needed, and committed
8. Pull request is created (for remote repositories)

### Key Technologies

- **@github/copilot-sdk**: Node.js SDK for GitHub Copilot
- **Express**: Web server framework
- **React**: Frontend UI library
- **Vite**: Frontend build tool and dev server
- **TypeScript**: Type-safe development
- **Server-Sent Events (SSE)**: Real-time streaming updates

## Troubleshooting

### "ADO_PAT environment variable is not set"
- This is only required if using Azure DevOps integration
- You can still use the app with local folders without a PAT
- If you need Azure DevOps features, create a `.env` file with your PAT token

### "Failed to clone repository"
- Verify your PAT has **Code > Read & Write** permissions
- Ensure the repository URL is correct
- Alternative: Use "Local Folder" mode instead

### "Copilot authentication failed"
- Run `github-copilot-cli auth` to authenticate
- Ensure you have an active GitHub Copilot subscription
- Check that `github-copilot-cli` is in your PATH

### Server won't start
- Check that port 3001 is available (or set `PORT` in `.env`)
- Ensure all dependencies are installed: `npm install`
- Check for any error messages in the console

### UI won't connect to server
- Ensure the backend server is running on `http://localhost:3001`
- Check browser console for CORS or network errors
- Verify the Vite dev server is running on port 5173

## License

MIT
