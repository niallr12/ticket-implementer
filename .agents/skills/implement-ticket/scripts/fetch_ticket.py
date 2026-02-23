#!/usr/bin/env python3
"""
Fetch an Azure DevOps work item and output its details as JSON.

Usage:
    fetch_ticket.py <azure_devops_url>

Environment:
    ADO_PAT  - Azure DevOps Personal Access Token (required)

URL Format:
    https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
    https://dev.azure.com/{org}/{project}/_workitems/view/{id}

Output (JSON):
    id, title, description, state, type, assignedTo, url, figmaUrl
"""

import sys
import re
import json
import html
import os
import base64
import urllib.request
import urllib.error
import urllib.parse


def parse_url(url):
    """Parse Azure DevOps work item URL into components."""
    match = re.match(
        r'https?://dev\.azure\.com/([^/]+)/([^/]+)/_workitems/(?:edit|view)/(\d+)',
        url.strip()
    )
    if not match:
        raise ValueError(
            f"Invalid Azure DevOps URL: {url}\n"
            "Expected format: https://dev.azure.com/{org}/{project}/_workitems/edit/{id}"
        )
    return {
        'organization': match.group(1),
        'project': urllib.parse.unquote(match.group(2)),
        'work_item_id': int(match.group(3)),
    }


def extract_figma_url(text):
    """Extract the first Figma URL from text (may be HTML-encoded content)."""
    if not text:
        return None
    pattern = r'https?://(?:www\.)?figma\.com/(?:file|design|proto)/[a-zA-Z0-9\-_]+(?:/[^\s"\'<>)\}\]]*)?'
    match = re.search(pattern, text)
    return match.group(0) if match else None


def strip_html(html_content):
    """Strip HTML tags and decode entities."""
    if not html_content:
        return ''
    clean = re.sub(r'<[^>]+>', ' ', html_content)
    clean = html.unescape(clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def fetch_work_item(organization, project, work_item_id, pat):
    """Fetch a work item from the Azure DevOps REST API."""
    encoded_project = urllib.parse.quote(project)
    api_url = (
        f"https://dev.azure.com/{organization}/{encoded_project}"
        f"/_apis/wit/workitems/{work_item_id}?api-version=7.0"
    )

    credentials = base64.b64encode(f":{pat}".encode()).decode()
    req = urllib.request.Request(
        api_url,
        headers={
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json',
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"HTTP {e.code} {e.reason} — failed to fetch work item {work_item_id}. "
            "Check that ADO_PAT is valid and has read access to this project."
        )
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e.reason}")

    fields = data.get('fields', {})
    raw_description = fields.get('System.Description') or ''

    figma_url = extract_figma_url(raw_description)
    description = strip_html(raw_description)

    assigned_to = fields.get('System.AssignedTo')
    if isinstance(assigned_to, dict):
        assigned_to = assigned_to.get('displayName')

    return {
        'id': data['id'],
        'title': fields.get('System.Title', ''),
        'description': description,
        'state': fields.get('System.State', ''),
        'type': fields.get('System.WorkItemType', ''),
        'assignedTo': assigned_to,
        'url': data.get('_links', {}).get('html', {}).get('href', ''),
        'figmaUrl': figma_url,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: fetch_ticket.py <azure_devops_url>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Required environment variable:", file=sys.stderr)
        print("  ADO_PAT  — Azure DevOps Personal Access Token", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]

    pat = os.environ.get('ADO_PAT')
    if not pat:
        print(json.dumps({
            'error': 'ADO_PAT environment variable is not set. '
                     'Export your Azure DevOps Personal Access Token: export ADO_PAT=<your_token>'
        }))
        sys.exit(1)

    try:
        components = parse_url(url)
        ticket = fetch_work_item(
            components['organization'],
            components['project'],
            components['work_item_id'],
            pat,
        )
        print(json.dumps(ticket, indent=2))
    except (ValueError, RuntimeError) as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
