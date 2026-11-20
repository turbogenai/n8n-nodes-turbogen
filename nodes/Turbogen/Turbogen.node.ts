import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import {
	apiRequest,
	downloadJobFile,
	findModel,
	getCatalog,
	getJob,
	loadAspects,
	loadModels,
	loadOptions,
	type TurbogenJob,
} from './GenericFunctions';

const GENERATE_RESOURCES = ['video', 'image', 'audio'];

function generateFields(resource: 'video' | 'image' | 'audio'): INodeProperties[] {
	const show = { resource: [resource], operation: ['generate'] };
	const label = { video: 'Video', image: 'Image', audio: 'Audio' }[resource];
	const fields: INodeProperties[] = [
		{
			displayName: 'Model Name or ID',
			name: 'model',
			type: 'options',
			typeOptions: { loadOptionsMethod: `get${label}Models` },
			displayOptions: { show },
			default: '',
			required: true,
			description:
				'Model to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: resource === 'audio' ? 'Voice / Mood Name or ID' : 'Aspect Ratio Name or ID',
			name: 'aspect',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getAspects', loadOptionsDependsOn: ['model'] },
			displayOptions: { show },
			default: '',
			required: true,
			description:
				'Aspect ratio (voice, mood or vocal for audio models). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName:
				resource === 'video'
					? 'Duration / Quality Name or ID'
					: resource === 'image'
						? 'Resolution / Quality Name or ID'
						: 'Length Name or ID',
			name: 'option',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getOptions', loadOptionsDependsOn: ['model'] },
			displayOptions: { show },
			default: '',
			required: true,
			description:
				'Sets the price of the job. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		},
		{
			displayName: resource === 'audio' ? 'Text or Prompt' : 'Prompt',
			name: 'prompt',
			type: 'string',
			typeOptions: { rows: 4 },
			displayOptions: { show },
			default: '',
			required: true,
			description:
				resource === 'audio'
					? 'For voice models the text to speak; for music, song and sound-effect models a description'
					: 'What to make: subject, action, camera move, light',
		},
	];
	if (resource === 'audio') {
		fields.push({
			displayName: 'Lyrics',
			name: 'lyrics',
			type: 'string',
			typeOptions: { rows: 4 },
			displayOptions: { show },
			default: '',
			description: 'Song lyrics. Only used by the song model with a vocal option.',
		});
	}
	if (resource !== 'audio') {
		fields.push({
			displayName: 'Input Image Binary Fields',
			name: 'refs',
			type: 'string',
			displayOptions: { show },
			default: '',
			placeholder: 'data',
			description:
				resource === 'video'
					? 'Comma-separated names of binary fields holding a start frame or reference images (PNG, JPEG, WEBP). Leave empty for text-to-video.'
					: 'Comma-separated names of binary fields holding reference images (PNG, JPEG, WEBP). Leave empty for text-to-image.',
		});
	}
	fields.push(
		{
			displayName: 'Wait for Completion',
			name: 'wait',
			type: 'boolean',
			displayOptions: { show },
			default: true,
			description:
				'Whether to poll until the job is done and return the result file. If off, the job ID is returned right away; use the Job resource to fetch it later.',
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add Option',
			displayOptions: { show: { ...show, wait: [true] } },
			default: {},
			options: [
				{
					displayName: 'Output Binary Field',
					name: 'binaryProperty',
					type: 'string',
					default: 'data',
					description: 'Name of the binary field that receives the result file',
				},
				{
					displayName: 'Poll Interval (Seconds)',
					name: 'pollInterval',
					type: 'number',
					typeOptions: { minValue: 3 },
					default: 5,
				},
				{
					displayName: 'Timeout (Minutes)',
					name: 'timeoutMinutes',
					type: 'number',
					typeOptions: { minValue: 1 },
					default: 10,
					description:
						'Give up waiting after this long. The job keeps running and can be fetched later.',
				},
			],
		},
	);
	return fields;
}

export class Turbogen implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Turbogen',
		name: 'turbogen',
		icon: { light: 'file:../../icons/turbogen.svg', dark: 'file:../../icons/turbogen.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Generate AI video, images and audio with Seedance, Kling, Veo, Nano Banana and more. Pay as you go.',
		defaults: { name: 'Turbogen' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'turbogenApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Audio', value: 'audio' },
					{ name: 'Image', value: 'image' },
					{ name: 'Job', value: 'job' },
					{ name: 'Model', value: 'model' },
					{ name: 'Video', value: 'video' },
				],
				default: 'video',
			},
			...GENERATE_RESOURCES.map(
				(r): INodeProperties => ({
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: { show: { resource: [r] } },
					options: [
						{
							name: 'Generate',
							value: 'generate',
							action: `Generate ${r}`,
							description: `Create a ${r} and optionally wait for the result`,
						},
					],
					default: 'generate',
				}),
			),
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['job'] } },
				options: [
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a job',
						description: 'Delete a finished job and its file',
					},
					{
						name: 'Download',
						value: 'download',
						action: 'Download job result',
						description: 'Download the result file of a finished job',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a job',
						description: 'Get the status of a job, optionally waiting until it is finished',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many jobs',
						description: 'List your latest jobs',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get Balance',
						value: 'getBalance',
						action: 'Get credit balance',
						description: 'Remaining credits of the account behind the API key',
					},
				],
				default: 'getBalance',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['model'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many models',
						description: 'List models with IDs, options and credit prices',
					},
				],
				default: 'getAll',
			},
			...generateFields('video'),
			...generateFields('image'),
			...generateFields('audio'),

			// Job
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				displayOptions: {
					show: { resource: ['job'], operation: ['get', 'download', 'delete'] },
				},
				default: '',
				required: true,
				description: 'The ID returned by a Generate operation',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitJob',
				type: 'boolean',
				displayOptions: { show: { resource: ['job'], operation: ['get', 'download'] } },
				default: false,
				description: 'Whether to poll until the job is done or failed',
			},
			{
				displayName: 'Download Result File',
				name: 'downloadFile',
				type: 'boolean',
				displayOptions: { show: { resource: ['job'], operation: ['get'] } },
				default: false,
				description: 'Whether to attach the result file as binary data when the job is done',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 200 },
				displayOptions: { show: { resource: ['job'], operation: ['getAll'] } },
				default: 50,
				description: 'Max number of results to return',
			},

			// Model
			{
				displayName: 'Type',
				name: 'kind',
				type: 'options',
				displayOptions: { show: { resource: ['model'], operation: ['getAll'] } },
				options: [
					{ name: 'All', value: '' },
					{ name: 'Audio', value: 'audio' },
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
				],
				default: '',
			},
		],
	};

	methods = {
		loadOptions: {
			async getVideoModels(this: ILoadOptionsFunctions) {
				return await loadModels.call(this, 'video');
			},
			async getImageModels(this: ILoadOptionsFunctions) {
				return await loadModels.call(this, 'image');
			},
			async getAudioModels(this: ILoadOptionsFunctions) {
				return await loadModels.call(this, 'audio');
			},
			async getAspects(this: ILoadOptionsFunctions) {
				return await loadAspects.call(this, 'model');
			},
			async getOptions(this: ILoadOptionsFunctions) {
				return await loadOptions.call(this, 'model');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'model') {
					const kind = this.getNodeParameter('kind', i) as string;
					const cat = await getCatalog.call(this);
					for (const m of cat.models.filter((x) => !kind || x.kind === kind)) {
						out.push({ json: m as unknown as IDataObject, pairedItem: i });
					}
				} else if (resource === 'account') {
					const res = (await apiRequest.call(this, {
						method: 'GET',
						path: '/api/jobs',
						qs: { limit: 1 },
					})) as IDataObject;
					out.push({
						json: { credits: res.credits, credit_expiry: res.credit_expiry ?? null },
						pairedItem: i,
					});
				} else if (resource === 'job') {
					out.push(...(await runJobOperation.call(this, operation, i)));
				} else {
					out.push(await runGenerate.call(this, resource, i));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}

async function waitForJob(
	this: IExecuteFunctions,
	jobId: string,
	pollSeconds: number,
	timeoutMinutes: number,
): Promise<{ job: TurbogenJob; timedOut: boolean }> {
	const deadline = Date.now() + timeoutMinutes * 60_000;
	let job = await getJob.call(this, jobId);
	while (job.status === 'queued' || job.status === 'running') {
		if (Date.now() > deadline) return { job, timedOut: true };
		await sleep(pollSeconds * 1000);
		job = await getJob.call(this, jobId);
	}
	return { job, timedOut: false };
}

async function finishJob(
	this: IExecuteFunctions,
	job: TurbogenJob,
	i: number,
	binaryProperty: string,
	download: boolean,
): Promise<INodeExecutionData> {
	const exec: INodeExecutionData = { json: { ...job }, pairedItem: i };
	if (job.status === 'failed') {
		throw new NodeOperationError(
			this.getNode(),
			`Generation failed: ${job.note ?? 'no reason given'}. Failed jobs are refunded automatically (job ${job.id}).`,
			{ itemIndex: i },
		);
	}
	if (job.status === 'done' && download) {
		exec.binary = { [binaryProperty]: await downloadJobFile.call(this, job) };
	}
	return exec;
}

async function runGenerate(
	this: IExecuteFunctions,
	resource: string,
	i: number,
): Promise<INodeExecutionData> {
	const modelId = this.getNodeParameter('model', i) as string;
	const model = await findModel.call(this, modelId);
	if (!model) {
		throw new NodeOperationError(this.getNode(), `Unknown model "${modelId}"`, { itemIndex: i });
	}
	if (model.kind !== resource) {
		throw new NodeOperationError(
			this.getNode(),
			`"${modelId}" is a ${model.kind} model, not ${resource}`,
			{ itemIndex: i },
		);
	}
	const form = new FormData();
	form.append('model', modelId);
	form.append('aspect', this.getNodeParameter('aspect', i) as string);
	form.append('option', this.getNodeParameter('option', i) as string);
	form.append('prompt', this.getNodeParameter('prompt', i) as string);
	if (resource === 'audio') {
		const lyrics = this.getNodeParameter('lyrics', i, '') as string;
		if (lyrics) form.append('lyrics', lyrics);
	} else {
		const refs = (this.getNodeParameter('refs', i, '') as string)
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		for (const name of refs) {
			const meta = this.helpers.assertBinaryData(i, name);
			const buf = await this.helpers.getBinaryDataBuffer(i, name);
			form.append(
				'refs',
				new Blob([new Uint8Array(buf)], { type: meta.mimeType }),
				meta.fileName ?? `${name}.png`,
			);
		}
	}

	const sub = (await apiRequest.call(this, {
		method: 'POST',
		path: '/api/jobs',
		body: form,
	})) as { job: TurbogenJob; credits?: number };

	const wait = this.getNodeParameter('wait', i) as boolean;
	if (!wait) {
		return { json: { ...sub.job, credits_left: sub.credits }, pairedItem: i };
	}
	const opts = this.getNodeParameter('options', i, {}) as {
		binaryProperty?: string;
		pollInterval?: number;
		timeoutMinutes?: number;
	};
	const { job, timedOut } = await waitForJob.call(
		this,
		sub.job.id,
		opts.pollInterval ?? 5,
		opts.timeoutMinutes ?? 10,
	);
	if (timedOut) {
		return { json: { ...job, timed_out: true, credits_left: sub.credits }, pairedItem: i };
	}
	const exec = await finishJob.call(this, job, i, opts.binaryProperty || 'data', true);
	exec.json.credits_left = sub.credits;
	return exec;
}

async function runJobOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	if (operation === 'getAll') {
		const limit = this.getNodeParameter('limit', i) as number;
		const res = (await apiRequest.call(this, {
			method: 'GET',
			path: '/api/jobs',
			qs: { limit },
		})) as { jobs: TurbogenJob[] };
		return res.jobs.map((j) => ({ json: { ...j }, pairedItem: i }));
	}
	const jobId = this.getNodeParameter('jobId', i) as string;
	if (operation === 'delete') {
		await apiRequest.call(this, { method: 'DELETE', path: `/api/jobs/${jobId}` });
		return [{ json: { id: jobId, deleted: true }, pairedItem: i }];
	}
	const wait = this.getNodeParameter('waitJob', i) as boolean;
	let job = await getJob.call(this, jobId);
	if (wait) {
		job = (await waitForJob.call(this, jobId, 5, 10)).job;
	}
	const download =
		operation === 'download' || (this.getNodeParameter('downloadFile', i, false) as boolean);
	if (operation === 'download' && job.status !== 'done') {
		throw new NodeOperationError(
			this.getNode(),
			`Job ${jobId} is ${job.status}, there is no file to download yet. Turn on "Wait for Completion".`,
			{ itemIndex: i },
		);
	}
	return [await finishJob.call(this, job, i, 'data', download)];
}
