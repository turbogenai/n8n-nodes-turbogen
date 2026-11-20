import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TurbogenApi implements ICredentialType {
	name = 'turbogenApi';

	displayName = 'Turbogen API';

	icon: Icon = { light: 'file:../icons/turbogen.svg', dark: 'file:../icons/turbogen.dark.svg' };

	documentationUrl = 'https://turbogen.app/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key on the API page of your Turbogen account (https://turbogen.app/#/apikeys). Keys start with lk_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials?.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://turbogen.app',
			url: '/api/jobs',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
