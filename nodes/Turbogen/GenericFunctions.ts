import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const BASE_URL = 'https://turbogen.app';

export interface TurbogenModel {
	id: string;
	name: string;
	kind: 'image' | 'video' | 'audio';
	tagline?: string;
	aspects: string[];
	aspect_label?: string;
	option_label?: string;
	prices: Record<string, number>;
	max_refs?: number;
	needs_ref?: boolean;
	available?: boolean;
	lyrics?: string[];
}

export interface TurbogenJob extends IDataObject {
	id: string;
	status: 'queued' | 'running' | 'done' | 'failed';
	model: string;
	cost?: number;
	note?: string | null;
	url?: string | null;
	mime?: string | null;
}

type Ctx = IExecuteFunctions | ILoadOptionsFunctions;

/** The model catalog is public, no key needed. */
export async function getCatalog(this: Ctx): Promise<{ models: TurbogenModel[] } & IDataObject> {
	const res = (await this.helpers.httpRequest({
		method: 'GET',
		url: `${BASE_URL}/api/models`,
		json: true,
	})) as { models: TurbogenModel[] } & IDataObject;
	return res;
}

export async function apiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: Omit<IHttpRequestOptions, 'url'> & { path: string },
): Promise<unknown> {
	const { path, ...rest } = options;
	return await this.helpers.httpRequestWithAuthentication.call(this, 'turbogenApi', {
		json: true,
		...rest,
		url: `${BASE_URL}${path}`,
	});
}

export async function loadModels(
	this: ILoadOptionsFunctions,
	kind: TurbogenModel['kind'],
): Promise<INodePropertyOptions[]> {
	const { models } = await getCatalog.call(this);
	return models
		.filter((m) => m.kind === kind && m.available !== false && !m.needs_ref)
		.map((m) => ({
			name: m.name === m.id ? m.id : `${m.name} (${m.id})`,
			value: m.id,
			description: m.tagline,
		}));
}

export async function findModel(
	this: ILoadOptionsFunctions | IExecuteFunctions,
	id: string,
): Promise<TurbogenModel | undefined> {
	const { models } = await getCatalog.call(this);
	return models.find((m) => m.id === id);
}

export async function loadAspects(this: ILoadOptionsFunctions, param: string) {
	const id = this.getCurrentNodeParameter(param) as string;
	const m = id ? await findModel.call(this, id) : undefined;
	return (m?.aspects ?? []).map((a) => ({ name: a, value: a }));
}

export async function loadOptions(this: ILoadOptionsFunctions, param: string) {
	const id = this.getCurrentNodeParameter(param) as string;
	const m = id ? await findModel.call(this, id) : undefined;
	return Object.entries(m?.prices ?? {}).map(([option, credits]) => ({
		name: `${option} (${credits} credits)`,
		value: option,
	}));
}

export async function getJob(this: IExecuteFunctions, jobId: string): Promise<TurbogenJob> {
	const res = (await apiRequest.call(this, {
		method: 'GET',
		path: '/api/jobs',
		qs: { limit: 200 },
	})) as { jobs: TurbogenJob[]; credits?: number };
	const job = res.jobs.find((j) => j.id === jobId);
	if (!job) {
		throw new NodeOperationError(
			this.getNode(),
			`Job ${jobId} was not found among your 200 most recent jobs`,
		);
	}
	return job;
}

export async function downloadJobFile(
	this: IExecuteFunctions,
	job: TurbogenJob,
): Promise<IBinaryData> {
	const response = (await apiRequest.call(this, {
		method: 'GET',
		path: `/api/jobs/${job.id}/file`,
		encoding: 'arraybuffer',
		json: false,
		returnFullResponse: true,
	})) as { body: Buffer; headers: Record<string, string> };
	const mime = (job.mime || response.headers['content-type'] || 'application/octet-stream')
		.split(';')[0]
		.trim();
	const ext =
		{
			'video/mp4': 'mp4',
			'image/png': 'png',
			'image/jpeg': 'jpg',
			'image/webp': 'webp',
			'audio/mpeg': 'mp3',
			'audio/wav': 'wav',
		}[mime] ?? 'bin';
	return await this.helpers.prepareBinaryData(
		Buffer.from(response.body),
		`${job.model}-${job.id.slice(0, 8)}.${ext}`,
		mime,
	);
}
