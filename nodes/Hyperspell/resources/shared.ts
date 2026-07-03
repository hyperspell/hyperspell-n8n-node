import type { INodePropertyOptions } from 'n8n-workflow';

// Source values must match the Hyperspell DocumentProviders enum exactly
// (apps/core/hyperspell_core/generated/types.py). Keep in sync when new
// integrations ship — a missing entry means users can't target that source.
export const sourceOptions: INodePropertyOptions[] = [
	{ name: 'Vault', value: 'vault' },
	{ name: 'Box', value: 'box' },
	{ name: 'Coda', value: 'coda' },
	{ name: 'Dropbox', value: 'dropbox' },
	{ name: 'Fathom', value: 'fathom' },
	{ name: 'Fireflies', value: 'fireflies' },
	{ name: 'GitHub', value: 'github' },
	{ name: 'Gmail Actions', value: 'gmail_actions' },
	{ name: 'Gong', value: 'gong' },
	{ name: 'Google Calendar', value: 'google_calendar' },
	{ name: 'Google Drive', value: 'google_drive' },
	{ name: 'Google Mail', value: 'google_mail' },
	{ name: 'Granola', value: 'granola' },
	{ name: 'HubSpot', value: 'hubspot' },
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
