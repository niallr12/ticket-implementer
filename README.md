# Ticket Implementer

A web application that uses GitHub Copilot SDK to automatically implement Azure DevOps tickets. Paste a ticket URL, review the AI-generated implementation plan, and let Copilot write the code for you.

## Features

- **Fetch Azure DevOps Tickets** - Parse ticket details from any Azure DevOps work item URL
- **AI-Generated Plans** - Generate implementation plans using GitHub Copilot
- **Plan Refinement** - Refine plans with natural language feedback or edit directly
- **Multi-Model Support** - Choose from Claude 4.5, GPT-4.1, or Gemini 2.5 Pro
- **Automatic Implementation** - Copilot implements the plan in a cloned repository
- **Post-Implementation Tasks** - Run tests, linting, or custom commands before committing
- **Automatic PR Creation** - Creates a pull request with all changes

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
- **GitHub Copilot CLI** - Install via `npm install -g @github/copilot`
- **GitHub Copilot Subscription** - Active Copilot subscription linked to your GitHub account
- **Azure DevOps Account** - With access to the repositories and work items you want to use

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

### 3. Create an Azure DevOps Personal Access Token (PAT)

1. Go to your Azure DevOps organization's token settings:
   ```
   https://dev.azure.com/{your-org}/_usersSettings/tokens
   ```

2. Click **New Token** and configure:
   - **Name:** `ticket-implementer` (or any descriptive name)
   - **Expiration:** Set as appropriate
   - **Scopes:** Select **Custom defined**, then enable:
     - **Work Items** → Read
     - **Code** → Read & Write (for cloning repos and pushing changes)

3. Click **Create** and copy the token immediately (you won't see it again)

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your PAT:

```
ADO_PAT=your-personal-access-token-here
```

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

1. **Enter Ticket URL** - Paste an Azure DevOps work item URL (e.g., `https://dev.azure.com/org/project/_workitems/edit/123`)

2. **Enter Repository URL** - Paste the Azure DevOps repository URL where changes should be made

3. **Review Implementation Plan** - The AI generates a summary and step-by-step plan
   - Edit the plan directly if needed
   - Use the "Refine Plan" feature to adjust with natural language feedback

4. **Select Model** - Choose which AI model to use for implementation

5. **Configure Post-Tasks** (optional) - Select tasks to run after implementation:
   - Run tests
   - Build project
   - Run linter
   - Custom commands

6. **Approve & Implement** - Watch as Copilot implements the changes

7. **Review PR** - Click the PR link to review the created pull request

## Project Structure

```
├── server/
│   ├── index.ts          # Express server entry
│   ├── routes/
│   │   └── ticket.ts     # API routes
│   └── services/
│       └── copilot.ts    # Copilot SDK wrapper
├── ui/
│   ├── src/
│   │   ├── App.tsx       # Main app component
│   │   └── components/   # React components
│   └── index.html
├── utils/
│   ├── azure-devops.ts      # Work item API
│   └── azure-devops-git.ts  # Git operations
└── index.ts              # CLI tool (optional)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ticket/fetch` | POST | Fetch ticket details from Azure DevOps |
| `/api/ticket/clone` | POST | Clone repository and create feature branch |
| `/api/ticket/plan` | POST | Generate implementation plan |
| `/api/ticket/refine` | POST | Refine plan with feedback |
| `/api/ticket/implement` | POST | Execute implementation (SSE stream) |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADO_PAT` | Azure DevOps Personal Access Token | Yes |
| `PORT` | Server port (default: 3001) | No |

## Troubleshooting

### "ADO_PAT environment variable is not set"
Make sure you've created a `.env` file with your PAT token. The server loads it via `dotenv`.

### "Failed to clone repository"
Verify your PAT has **Code > Read & Write** permissions and the repository URL is correct.

### "Copilot authentication failed"
Run `github-copilot-cli auth` to re-authenticate with GitHub.

## License

MIT
