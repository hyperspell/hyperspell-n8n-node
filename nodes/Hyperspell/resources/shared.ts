import type { INodePropertyOptions } from 'n8n-workflow';

export const sourceOptions: INodePropertyOptions[] = [
	{ name: 'Vault (Default)', value: 'vault' },
	{ name: 'Box', value: 'box' },
	{ name: 'Dropbox', value: 'dropbox' },
	{ name: 'GitHub', value: 'github' },
	{ name: 'Gmail Actions', value: 'gmail_actions' },
	{ name: 'Google Calendar', value: 'google_calendar' },
	{ name: 'Google Drive', value: 'google_drive' },
	{ name: 'Google Mail', value: 'google_mail' },
	{ name: 'Microsoft Teams', value: 'microsoft_teams' },
	{ name: 'Notion', value: 'notion' },
	{ name: 'Reddit', value: 'reddit' },
	{ name: 'Slack', value: 'slack' },
	{ name: 'Trace', value: 'trace' },
	{ name: 'Web Crawler', value: 'web_crawler' },
];
