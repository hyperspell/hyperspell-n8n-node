import type { INodePropertyOptions } from 'n8n-workflow';

// Source values must match the Hyperspell DocumentProviders enum exactly
// (apps/core/hyperspell_core/generated/types.py). Keep in sync when new
// integrations ship — a missing entry means users can't target that source,
// AND (since 0.3.1) that an empty Sources selection silently skips it, because
// the all-sources default is built from this list. Drift here is invisible:
// the query still succeeds, it just never looks at the missing source.
//
// Verified against core on 2026-07-29. Deliberately omitted: `reddit`, which
// the enum still carries but the product does not offer (dropped in 0.3.1).
export const sourceOptions: INodePropertyOptions[] = [
	{ name: 'Vault', value: 'vault' },
	{ name: 'Box', value: 'box' },
	{ name: 'ClickUp', value: 'clickup' },
	{ name: 'Coda', value: 'coda' },
	{ name: 'Confluence', value: 'confluence' },
	{ name: 'Dropbox', value: 'dropbox' },
	{ name: 'Fathom', value: 'fathom' },
	{ name: 'Fireflies', value: 'fireflies' },
	{ name: 'GitHub', value: 'github' },
	{ name: 'Gong', value: 'gong' },
	{ name: 'Google Calendar', value: 'google_calendar' },
	{ name: 'Google Drive', value: 'google_drive' },
	{ name: 'Google Mail', value: 'google_mail' },
	{ name: 'Google Meet', value: 'google_meet' },
	{ name: 'Granola', value: 'granola' },
	{ name: 'HubSpot', value: 'hubspot' },
	{ name: 'Jira', value: 'jira' },
	{ name: 'Lightfield', value: 'lightfield' },
	{ name: 'Linear', value: 'linear' },
	{ name: 'Microsoft Teams', value: 'microsoft_teams' },
	{ name: 'Notion', value: 'notion' },
	{ name: 'Pylon', value: 'pylon' },
	{ name: 'Salesforce', value: 'salesforce' },
	{ name: 'Slack', value: 'slack' },
	{ name: 'Trace', value: 'trace' },
	{ name: 'Web Crawler', value: 'web_crawler' },
];
