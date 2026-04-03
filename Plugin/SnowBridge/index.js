const BRIDGE_VERSION = '2.1.0';
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const CANCELLED_INVOCATION_TTL_MS = 5 * 60 * 1000;
const SNOW_REQUEST_HEADER_KEYS = [
	'x-snow-client',
	'x-snow-protocol',
	'x-snow-tool-mode',
	'x-snow-channel',
];
const SNOW_SOURCE_CONTRACT = Object.freeze({
	'x-snow-client': ['snow-cli'],
	'x-snow-protocol': ['function-calling'],
	'x-snow-channel': ['bridge-ws'],
});
const BRIDGE_COMPACT_TARGET_TOOLS = new Set([
	'FileOperator',
	'UrlFetch',
	'LightMemo',
	'VSearch',
]);
const BRIDGE_COMPACT_MAX_LINES = 18;
const BRIDGE_COMPACT_MAX_CHARS = 1400;
const BRIDGE_COMPACT_TOP_ITEMS = 3;
const BRIDGE_COMPACT_MIN_LINES = 14;
const BRIDGE_COMPACT_MIN_CHARS = 600;
const BRIDGE_COMPACT_COLLECTION_KEYS = [
	'items',
	'results',
	'files',
	'entries',
	'matches',
	'hits',
	'documents',
	'rows',
	'records',
	'data',
	'list',
];

function splitCsv(value) {
	return String(value || '')
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
}

function buildError(code, message, extra = {}) {
	const details =
		extra.details && typeof extra.details === 'object' ? extra.details : undefined;

	return {
		code,
		message,
		retryable: extra.retryable === true,
		source: extra.source || 'snowbridge',
		...(details ? {details} : {}),
		...Object.fromEntries(
			Object.entries(extra).filter(([key]) =>
				!['details', 'retryable', 'source'].includes(key),
			),
		),
	};
}

function normalizeToolIdSegment(value) {
	return (
		String(value || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'tool'
	);
}

function buildBridgeToolId(originName) {
	return [
		normalizeToolIdSegment('vcp_bridge'),
		normalizeToolIdSegment('snowbridge'),
		normalizeToolIdSegment(originName),
	].join(':');
}

function uniqueStrings(values) {
	return Array.from(
		new Set(
			values
				.map(value => String(value || '').trim())
				.filter(Boolean),
		),
	);
}

function normalizeCommandName(command) {
	if (!command || typeof command !== 'object') {
		return null;
	}

	return command.commandIdentifier || command.command || null;
}

function normalizeInvocationCommand(command) {
	const commandName = normalizeCommandName(command);
	if (!commandName) {
		return null;
	}

	return {
		commandName,
		description: normalizeBridgeText(command.description || ''),
		parameters: Array.isArray(command.parameters) ? command.parameters : [],
		example: normalizeBridgeText(command.example || ''),
	};
}

function parseToolError(error) {
	if (!error) {
		return buildError('bridge_unknown_error', 'Unknown bridge error.');
	}

	if (typeof error === 'string') {
		return buildError('bridge_error', error);
	}

	if (error.message) {
		try {
			const parsed = JSON.parse(error.message);
			if (parsed.plugin_error || parsed.plugin_execution_error) {
				return buildError(
					'plugin_execution_error',
					parsed.plugin_error || parsed.plugin_execution_error,
					{
						source: 'plugin',
						details: parsed,
					},
				);
			}
		} catch {}

		return buildError('bridge_error', error.message, {
			source: 'snowbridge',
		});
	}

	if (typeof error === 'object' && error.code) {
		return buildError(error.code, error.message || String(error), {
			retryable: error.retryable === true,
			source: error.source || 'snowbridge',
			details:
				error.details && typeof error.details === 'object'
					? error.details
					: undefined,
		});
	}

	return buildError('bridge_error', String(error));
}

function buildCapabilityTags(bridgeCommands, bridgeCapabilities) {
	const tags = ['bridge_transport'];

	tags.push((bridgeCommands || []).length > 1 ? 'multi_command' : 'single_command');

	if (bridgeCapabilities.cancelVcpTool) {
		tags.push('cancellable');
	}

	if (bridgeCapabilities.asyncCallbacks) {
		tags.push('async_callback');
	}

	if (bridgeCapabilities.statusEvents) {
		tags.push('status_events');
	}

	if (bridgeCapabilities.clientAuth) {
		tags.push('client_auth');
	}

	return uniqueStrings(tags);
}

function normalizeBridgeText(description) {
	return String(description || '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.trimEnd())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function buildAsyncStatusPayload(context, options = {}) {
	const taskId = String(options.taskId || context.taskId || '').trim() || undefined;
	const state = options.state || 'running';
	const event = options.event || 'lifecycle';
	const status = options.status || state;

	return {
		requestId: context.requestId,
		invocationId: context.invocationId,
		toolId: context.toolId,
		toolName: context.publicName || context.toolName,
		originName: context.toolName,
		status,
		async: true,
		...(taskId ? {taskId} : {}),
		asyncStatus: {
			enabled: true,
			state,
			event,
			...(taskId ? {taskId} : {}),
		},
		...(options.result !== undefined ? {result: options.result} : {}),
		...(options.error ? {error: options.error} : {}),
		...(options.extra || {}),
	};
}

function buildToolResultPayload(context, options = {}) {
	const taskId = String(options.taskId || context.taskId || '').trim() || undefined;
	const error = options.error;
	const nextStatus = options.status || (error ? 'error' : 'success');
	const compactResultSidecar =
		!error && options.result !== undefined
			? buildCompactResultSidecar(context.toolName, options.result, {
					status: nextStatus,
					asyncState: taskId ? (nextStatus === 'error' ? 'error' : 'completed') : undefined,
			  })
			: null;

	return {
		requestId: context.requestId,
		invocationId: context.invocationId,
		toolId: context.toolId,
		toolName: context.publicName || context.toolName,
		originName: context.toolName,
		status: nextStatus,
		...(taskId ? {taskId} : {}),
		asyncStatus: {
			enabled: Boolean(taskId),
			state: nextStatus === 'error' ? 'error' : 'completed',
			event: 'result',
			...(taskId ? {taskId} : {}),
		},
		...(options.result !== undefined ? {result: options.result} : {}),
		...(error ? {error} : {}),
		...(compactResultSidecar || {}),
	};
}

function trimCompactLine(text, maxChars = 160) {
	const normalized = String(text || '').replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return '';
	}

	return normalized.length <= maxChars
		? normalized
		: `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
}

function summarizeCompactText(text) {
	const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
	if (!normalized) {
		return '';
	}

	const lines = normalized.split('\n');
	let summarized = normalized;

	if (lines.length > BRIDGE_COMPACT_MAX_LINES) {
		summarized =
			lines.slice(0, BRIDGE_COMPACT_MAX_LINES).join('\n') +
			`\n...[truncated ${lines.length - BRIDGE_COMPACT_MAX_LINES} more lines]`;
	}

	if (summarized.length > BRIDGE_COMPACT_MAX_CHARS) {
		const remainingChars = summarized.length - BRIDGE_COMPACT_MAX_CHARS;
		summarized =
			summarized.slice(0, BRIDGE_COMPACT_MAX_CHARS) +
			`...[truncated ${remainingChars} more chars]`;
	}

	return summarized;
}

function collectResultTextSegments(value, depth = 0) {
	if (value === null || value === undefined || depth > 4) {
		return [];
	}

	if (typeof value === 'string') {
		return [value];
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return [String(value)];
	}

	if (Array.isArray(value)) {
		return value.flatMap(item => {
			if (item && typeof item === 'object' && item.type === 'text') {
				return typeof item.text === 'string' ? [item.text] : [];
			}

			return collectResultTextSegments(item, depth + 1);
		});
	}

	if (typeof value !== 'object') {
		return [String(value)];
	}

	const segments = [];
	for (const key of ['message', 'summary']) {
		if (typeof value[key] === 'string' && value[key].trim()) {
			segments.push(value[key]);
		}
	}

	for (const key of ['content', 'data', 'result', 'details']) {
		if (value[key] !== undefined) {
			segments.push(...collectResultTextSegments(value[key], depth + 1));
		}
	}

	return segments;
}

function extractPrimaryCollection(value) {
	if (!value || typeof value !== 'object') {
		return null;
	}

	for (const key of BRIDGE_COMPACT_COLLECTION_KEYS) {
		if (Array.isArray(value[key])) {
			return {
				label: key,
				items: value[key],
			};
		}
	}

	if (value.result && typeof value.result === 'object') {
		return extractPrimaryCollection(value.result);
	}

	if (value.data && typeof value.data === 'object') {
		return extractPrimaryCollection(value.data);
	}

	if (value.details && typeof value.details === 'object') {
		return extractPrimaryCollection(value.details);
	}

	return null;
}

function extractTopItemLabel(item) {
	if (item === null || item === undefined) {
		return null;
	}

	if (typeof item === 'string') {
		return trimCompactLine(item, 120);
	}

	if (typeof item !== 'object') {
		return String(item);
	}

	for (const key of ['name', 'path', 'filePath', 'title', 'url', 'id', 'summary']) {
		if (typeof item[key] === 'string' && item[key].trim()) {
			return trimCompactLine(item[key], 120);
		}
	}

	const previewEntries = Object.entries(item).slice(0, 2);
	if (previewEntries.length === 0) {
		return null;
	}

	return trimCompactLine(
		previewEntries.map(([key, value]) => `${key}=${String(value)}`).join(', '),
		120,
	);
}

function extractTopItemsFromText(text) {
	const lines = String(text || '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);

	const tableRows = lines
		.filter(
			line =>
				line.startsWith('|') &&
				!line.includes('---') &&
				!/\|\s*(名称|name)\s*\|/i.test(line),
		)
		.map(line => line.split('|')[1]?.trim())
		.filter(Boolean);
	if (tableRows.length > 0) {
		return tableRows.slice(0, BRIDGE_COMPACT_TOP_ITEMS);
	}

	const bulletRows = lines
		.map(line => line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/)?.[1]?.trim())
		.filter(Boolean);
	if (bulletRows.length > 0) {
		return bulletRows.slice(0, BRIDGE_COMPACT_TOP_ITEMS);
	}

	return lines.slice(1, 1 + BRIDGE_COMPACT_TOP_ITEMS).map(line => trimCompactLine(line, 120));
}

function extractCountByRegex(text, pattern) {
	const match = String(text || '').match(pattern);
	if (!match) {
		return undefined;
	}

	const value = Number.parseInt(match[1], 10);
	return Number.isFinite(value) ? value : undefined;
}

function buildPluginSpecificSummary(toolName, result, text) {
	const resultRoot =
		result && typeof result === 'object' && result.result && typeof result.result === 'object'
			? result.result
			: result && typeof result === 'object' && result.data && typeof result.data === 'object'
			? result.data
			: result;
	const details =
		resultRoot && typeof resultRoot === 'object' && resultRoot.details && typeof resultRoot.details === 'object'
			? resultRoot.details
			: result && typeof result === 'object' && result.details && typeof result.details === 'object'
			? result.details
			: {};

	switch (toolName) {
		case 'FileOperator': {
			const detailMessage =
				typeof resultRoot?.message === 'string' && resultRoot.message.trim()
					? resultRoot.message
					: typeof details.message === 'string' && details.message.trim()
					? details.message
					: null;
			if (detailMessage) {
				return trimCompactLine(detailMessage, 180);
			}
			break;
		}
		case 'UrlFetch': {
			const pageTitle =
				typeof resultRoot?.pageTitle === 'string' && resultRoot.pageTitle.trim()
					? resultRoot.pageTitle.trim()
					: typeof details.pageTitle === 'string' && details.pageTitle.trim()
					? details.pageTitle.trim()
					: '';
			const originalUrl =
				typeof resultRoot?.originalUrl === 'string' && resultRoot.originalUrl.trim()
					? resultRoot.originalUrl.trim()
					: typeof details.originalUrl === 'string' && details.originalUrl.trim()
					? details.originalUrl.trim()
					: '';
			if (pageTitle && originalUrl) {
				return trimCompactLine(
					`UrlFetch captured "${pageTitle}" from ${originalUrl}.`,
					180,
				);
			}
			if (originalUrl) {
				return trimCompactLine(`UrlFetch fetched ${originalUrl}.`, 180);
			}
			break;
		}
		case 'LightMemo': {
			const queryMatch = text.match(/\[查询内容:\s*"([^"]+)"/);
			const query = queryMatch?.[1]?.trim();
			const itemCount = extractCountByRegex(text, /找到\s+(\d+)\s+条相关记忆片段/);
			if (itemCount !== undefined) {
				return trimCompactLine(
					`LightMemo recalled ${itemCount} memo fragment(s)${
						query ? ` for "${query}"` : ''
					}.`,
					180,
				);
			}
			break;
		}
		case 'VSearch': {
			const keywordMatches = Array.from(
				text.matchAll(/^###\s*关键词:\s*(.+)$/gm),
			).map(match => trimCompactLine(match[1], 80));
			const topicMatch = text.match(/\*\*研究主题\*\*:\s*(.+)/);
			const topic = topicMatch?.[1]?.trim();
			if (keywordMatches.length > 0) {
				return trimCompactLine(
					`VSearch generated research report${
						topic ? ` for "${topic}"` : ''
					} using ${keywordMatches.length} keyword(s).`,
					180,
				);
			}
			break;
		}
	}

	const firstMeaningfulLine = String(text || '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map(line => line.replace(/^#+\s*/, '').trim())
		.find(Boolean);

	return firstMeaningfulLine ? trimCompactLine(firstMeaningfulLine, 180) : '';
}

function buildPluginSpecificTopItems(toolName, text, result, primaryCollection) {
	switch (toolName) {
		case 'LightMemo': {
			const diaryMatches = Array.from(
				String(text || '').matchAll(/--- \(来源:\s*([^,]+),/g),
			)
				.map(match => trimCompactLine(match[1], 120))
				.filter(Boolean);
			if (diaryMatches.length > 0) {
				return diaryMatches.slice(0, BRIDGE_COMPACT_TOP_ITEMS);
			}
			break;
		}
		case 'VSearch': {
			const keywordMatches = Array.from(
				String(text || '').matchAll(/^###\s*关键词:\s*(.+)$/gm),
			)
				.map(match => trimCompactLine(match[1], 120))
				.filter(Boolean);
			if (keywordMatches.length > 0) {
				return keywordMatches.slice(0, BRIDGE_COMPACT_TOP_ITEMS);
			}
			break;
		}
		case 'UrlFetch': {
			const resultRoot =
				result &&
				typeof result === 'object' &&
				result.result &&
				typeof result.result === 'object'
					? result.result
					: result &&
					  typeof result === 'object' &&
					  result.data &&
					  typeof result.data === 'object'
					? result.data
					: result;
			const details =
				resultRoot &&
				typeof resultRoot === 'object' &&
				resultRoot.details &&
				typeof resultRoot.details === 'object'
					? resultRoot.details
					: {};
			const topItems = [
				resultRoot?.pageTitle,
				resultRoot?.originalUrl,
				resultRoot?.serverPath,
				details.pageTitle,
				details.originalUrl,
				details.imageUrl,
			]
				.filter(value => typeof value === 'string' && value.trim())
				.map(value => trimCompactLine(value, 120));
			if (topItems.length > 0) {
				return topItems.slice(0, BRIDGE_COMPACT_TOP_ITEMS);
			}
			break;
		}
	}

	if (primaryCollection?.items?.length) {
		return primaryCollection.items
			.slice(0, BRIDGE_COMPACT_TOP_ITEMS)
			.map(extractTopItemLabel)
			.filter(Boolean);
	}

	return extractTopItemsFromText(text);
}

function buildCompactResultSidecar(toolName, result, options = {}) {
	if (
		result &&
		typeof result === 'object' &&
		typeof result.historyContent === 'string' &&
		result.historyContent.trim()
	) {
		return {
			historyContent: summarizeCompactText(result.historyContent),
			...(typeof result.previewContent === 'string' && result.previewContent.trim()
				? {previewContent: result.previewContent}
				: {}),
		};
	}

	if (!BRIDGE_COMPACT_TARGET_TOOLS.has(toolName)) {
		return null;
	}

	const rawText = collectResultTextSegments(result).join('\n\n').trim();
	const summarizedText = summarizeCompactText(rawText);
	const primaryCollection = extractPrimaryCollection(result);
	const keywordMatchCount = Array.from(
		String(rawText || '').matchAll(/^###\s*关键词:\s*(.+)$/gm),
	).length;
	const itemCount =
		primaryCollection?.items?.length ??
		extractCountByRegex(rawText, /找到\s+(\d+)\s+条相关记忆片段/) ??
		(keywordMatchCount > 0 ? keywordMatchCount : undefined);
	const topItems = buildPluginSpecificTopItems(
		toolName,
		rawText,
		result,
		primaryCollection,
	);
	const summary = buildPluginSpecificSummary(toolName, result, rawText);
	const truncated =
		Boolean(summarizedText) &&
		summarizedText !== rawText;
	const isHighVolume =
		truncated ||
		rawText.length > BRIDGE_COMPACT_MIN_CHARS ||
		rawText.split(/\r\n?|\n/).filter(Boolean).length > BRIDGE_COMPACT_MIN_LINES ||
		(itemCount !== undefined && itemCount > BRIDGE_COMPACT_TOP_ITEMS);

	if ((!summary && !summarizedText) || !isHighVolume) {
		return null;
	}

	const historyLines = [];
	if (summary) {
		historyLines.push(summary);
	}
	if (itemCount !== undefined) {
		historyLines.push(`itemCount: ${itemCount}`);
	}
	if (topItems.length > 0) {
		historyLines.push('topItems:');
		for (const item of topItems.slice(0, BRIDGE_COMPACT_TOP_ITEMS)) {
			historyLines.push(`- ${item}`);
		}
	}
	if (truncated) {
		historyLines.push('[truncated raw result omitted]');
	}

	const historyContent = summarizeCompactText(historyLines.join('\n'));
	if (!historyContent) {
		return null;
	}

	return {
		historyContent,
		previewContent: JSON.stringify({
			summary: summary || trimCompactLine(historyContent, 180),
			...(options.status ? {status: options.status} : {}),
			...(options.asyncState ? {asyncState: options.asyncState} : {}),
			...(itemCount !== undefined ? {itemCount} : {}),
			...(topItems.length > 0 ? {topItems: topItems.slice(0, BRIDGE_COMPACT_TOP_ITEMS)} : {}),
			...(truncated ? {truncated: true} : {}),
		}),
	};
}

function normalizeHeaderValue(value) {
	return String(value || '').trim();
}

function normalizeHeaderMap(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => typeof key === 'string')
			.map(([key, headerValue]) => [
				key.trim().toLowerCase(),
				normalizeHeaderValue(headerValue),
			])
			.filter(([, headerValue]) => Boolean(headerValue)),
	);
}

class SnowBridge {
	constructor() {
		this.pluginManager = null;
		this.wss = null;
		this.config = {};
		this.debugMode = false;
		this.isHooked = false;
		this.eventSubscriptions = [];
		this.patchState = null;
		this.activeInvocations = new Map(); // invocationId -> context
		this.taskToInvocationMap = new Map(); // taskId -> invocationId
		this.rateLimitState = new Map(); // clientKey -> { windowStart, count }
	}

	async initialize(config, dependencies) {
		this.config = config;
		this.debugMode = config.DebugMode === true;
		this.log = dependencies.vcpLogFunctions || {
			pushVcpLog: () => {},
			pushVcpInfo: () => {},
		};

		try {
			this.bindPluginManager(require('../../Plugin.js'));
			this.setupEventListeners();
		} catch (error) {
			console.error(
				'[SnowBridge] Failed to load PluginManager for event listening:',
				error.message,
			);
		}

		if (this.debugMode) {
			console.log('[SnowBridge] Initialized with event listeners.');
		}
	}

	bindPluginManager(pluginManager) {
		if (this.pluginManager === pluginManager) {
			return;
		}

		this.removeEventListeners();
		this.pluginManager = pluginManager;
	}

	setupEventListeners() {
		if (!this.pluginManager) {
			return;
		}

		this.removeEventListeners();

		const forwardLog = (bridgeType, data) => {
			if (this.config.Bridge_Enabled === false) {
				return;
			}

			const taskId = String(data.job_id || data.taskId || '');
			if (!taskId) {
				return;
			}

			const invocationId = this.taskToInvocationMap.get(taskId);
			const context = invocationId
				? this.activeInvocations.get(invocationId)
				: null;

			if (!context || context.cancelled) {
				return;
			}

			if (this.debugMode) {
				console.log(
					`[SnowBridge] Forwarding ${bridgeType} for task ${taskId} to ${context.serverId}`,
				);
			}

			this.sendToServer(context.serverId, {
				type: 'vcp_tool_status',
				data: {
					...data,
					...buildAsyncStatusPayload(context, {
						taskId,
						state: 'running',
						status: 'running',
						event: bridgeType === 'log' ? 'log' : 'info',
						extra: {bridgeType},
					}),
				},
			});
		};

		const logListener = data => forwardLog('log', data);
		const infoListener = data => forwardLog('info', data);
		const asyncCallbackListener = info => {
			if (this.config.Bridge_Enabled === false) {
				return;
			}

			const taskId = String(info.taskId || '');
			if (!taskId) {
				return;
			}

			const invocationId = this.taskToInvocationMap.get(taskId);
			const context = invocationId
				? this.activeInvocations.get(invocationId)
				: null;

			if (!context) {
				return;
			}

			if (context.cancelled) {
				this.cleanupInvocation(invocationId);
				return;
			}

			if (this.debugMode) {
				console.log(
					`[SnowBridge] Forwarding async result for task ${taskId} to ${context.serverId}`,
				);
			}

			this.sendToServer(context.serverId, {
				type: 'vcp_tool_result',
				data: buildToolResultPayload(context, {
					taskId,
					status: 'success',
					result: info.data,
				}),
			});
			this.cleanupInvocation(invocationId);
		};

		this.pluginManager.on('vcp_log', logListener);
		this.pluginManager.on('vcp_info', infoListener);
		this.pluginManager.on('plugin_async_callback', asyncCallbackListener);
		this.eventSubscriptions = [
			{eventName: 'vcp_log', listener: logListener},
			{eventName: 'vcp_info', listener: infoListener},
			{eventName: 'plugin_async_callback', listener: asyncCallbackListener},
		];
	}

	removeEventListeners() {
		if (!this.pluginManager || this.eventSubscriptions.length === 0) {
			this.eventSubscriptions = [];
			return;
		}

		for (const subscription of this.eventSubscriptions) {
			if (typeof this.pluginManager.off === 'function') {
				this.pluginManager.off(subscription.eventName, subscription.listener);
				continue;
			}

			if (typeof this.pluginManager.removeListener === 'function') {
				this.pluginManager.removeListener(
					subscription.eventName,
					subscription.listener,
				);
			}
		}

		this.eventSubscriptions = [];
	}

	registerApiRoutes(router, config, projectBasePath, wss) {
		if (this.wss && this.wss !== wss) {
			this.removeMonkeyPatch();
		}

		this.wss = wss;
		this.config = {...this.config, ...config};

		if (!this.wss) {
			console.error(
				'[SnowBridge] WebSocketServer instance is missing in registerApiRoutes.',
			);
			return;
		}

		this.applyMonkeyPatch();

		router.get('/status', (req, res) => {
			res.json({
				status: 'active',
				hooked: this.isHooked,
				bridgeEnabled: this.config.Bridge_Enabled !== false,
				bridgeVersion: BRIDGE_VERSION,
				capabilities: this.getBridgeCapabilities(),
			});
		});

		if (this.debugMode) {
			console.log(
				'[SnowBridge] API routes registered and monkey patch applied.',
			);
		}
	}

	applyMonkeyPatch() {
		if (
			this.patchState?.wss === this.wss &&
			this.patchState.wss?.handleDistributedServerMessage ===
				this.patchState.wrappedHandler
		) {
			return;
		}

		const wss = this.wss;
		let pluginManager;
		try {
			pluginManager = require('../../Plugin.js');
		} catch (error) {
			console.error(
				'[SnowBridge] Error requiring Plugin.js:',
				error.message,
			);
		}

		if (!pluginManager) {
			console.error('[SnowBridge] Could not obtain PluginManager instance.');
			return;
		}

		this.bindPluginManager(pluginManager);

		const originalHandler = wss.handleDistributedServerMessage;
		if (typeof originalHandler !== 'function') {
			console.error(
				'[SnowBridge] WebSocketServer.handleDistributedServerMessage is not a function. Hook failed.',
			);
			return;
		}

		this.removeMonkeyPatch();

		const self = this;
		const wrappedHandler = async function (serverId, message) {
			if (self.config.Bridge_Enabled === false) {
				return originalHandler.call(wss, serverId, message);
			}

			try {
				const requestData =
					message && typeof message.data === 'object' && message.data !== null
						? message.data
						: {};

				if (self.debugMode) {
					console.log(
						`[SnowBridge] Intercepted message type ${message.type} from ${serverId}`,
					);
				}

				switch (message.type) {
					case 'get_vcp_manifests':
						if (!self.isSnowBridgeRequest(requestData)) {
							break;
						}
						await self.handleGetManifests(serverId, message, pluginManager);
						return;

					case 'execute_vcp_tool':
						if (!self.isSnowBridgeRequest(requestData)) {
							break;
						}
						await self.handleExecuteTool(serverId, message, pluginManager);
						return;

					case 'cancel_vcp_tool':
						if (!self.isSnowBridgeRequest(requestData)) {
							break;
						}
						await self.handleCancelTool(serverId, message);
						return;
				}
			} catch (error) {
				console.error(
					`[SnowBridge] Error handling bridged message ${message.type}:`,
					error,
				);
			}

			return originalHandler.call(wss, serverId, message);
		};
		wrappedHandler.__snowBridgePatched = true;
		wrappedHandler.__snowBridgeOriginalHandler = originalHandler;

		wss.handleDistributedServerMessage = wrappedHandler;
		this.patchState = {
			wss,
			originalHandler,
			wrappedHandler,
		};

		this.isHooked = true;
		console.log(
			'[SnowBridge] Monkey patch successful: SnowBridge is now active.',
		);
	}

	removeMonkeyPatch() {
		if (!this.patchState) {
			this.isHooked = false;
			return;
		}

		const {wss, originalHandler, wrappedHandler} = this.patchState;
		if (wss?.handleDistributedServerMessage === wrappedHandler) {
			wss.handleDistributedServerMessage = originalHandler;
		}

		this.patchState = null;
		this.isHooked = false;
	}

	sendToServer(serverId, payload) {
		if (!this.wss) {
			return false;
		}

		return this.wss.sendMessageToClient(serverId.replace('dist-', ''), payload);
	}

	getBridgeCapabilities() {
		return {
			cancelVcpTool: true,
			toolFilters: true,
			asyncCallbacks: true,
			statusEvents: true,
			clientAuth: Boolean(this.getBridgeAccessToken()),
		};
	}

	getBridgeAccessToken() {
		return String(this.config.Bridge_Access_Token || '').trim();
	}

	getAllowedTools() {
		return new Set(splitCsv(this.config.Allowed_Tools));
	}

	getExcludedTools() {
		return new Set(splitCsv(this.config.Excluded_Tools));
	}

	getExcludedDisplayKeywords() {
		return splitCsv(this.config.Excluded_Display_Keywords).map(keyword =>
			keyword.replace(/^["']|["']$/g, ''),
		);
	}

	getRateLimitPerMinute() {
		const parsed = Number.parseInt(this.config.Rate_Limit_Per_Minute, 10);
		return Number.isInteger(parsed) && parsed > 0
			? parsed
			: DEFAULT_RATE_LIMIT_PER_MINUTE;
	}

	isSnowRequestHeaderValidationRequired() {
		return this.config.Require_Snow_Request_Headers !== false;
	}

	getRequiredSnowSourceValues(headerName) {
		return new Set(SNOW_SOURCE_CONTRACT[headerName] || []);
	}

	getAllowedSnowToolModes() {
		return new Set(splitCsv(this.config.Allowed_Snow_Tool_Modes));
	}

	getSnowRequestHeaders(data) {
		return normalizeHeaderMap(data?.requestHeaders);
	}

	hasRequestHeaders(data) {
		return Boolean(
			data &&
				typeof data === 'object' &&
				Object.prototype.hasOwnProperty.call(data, 'requestHeaders'),
		);
	}

	isSnowBridgeRequest(data) {
		if (!this.isSnowRequestHeaderValidationRequired()) {
			return true;
		}

		if (!this.hasRequestHeaders(data)) {
			return false;
		}

		const headers = this.getSnowRequestHeaders(data);
		return (
			SNOW_REQUEST_HEADER_KEYS.some(key => Boolean(headers[key]))
		);
	}

	getClientIdentity(serverId, data) {
		const snowHeaders = this.getSnowRequestHeaders(data);
		const clientInfo =
			data && typeof data.clientInfo === 'object' && data.clientInfo !== null
				? data.clientInfo
				: {};

		return (
			snowHeaders['x-snow-client'] ||
			clientInfo.clientId ||
			clientInfo.clientName ||
			clientInfo.name ||
			serverId
		);
	}

	assertSnowSourceMetadata(data) {
		if (!this.isSnowRequestHeaderValidationRequired()) {
			return;
		}

		if (!this.hasRequestHeaders(data)) {
			throw buildError(
				'bridge_source_metadata_missing',
				'SnowBridge requires requestHeaders with explicit Snow source metadata.',
			);
		}

		const headers = this.getSnowRequestHeaders(data);
		const missingHeaders = SNOW_REQUEST_HEADER_KEYS.filter(key => !headers[key]);
		if (missingHeaders.length > 0) {
			throw buildError(
				'bridge_source_metadata_invalid',
				'SnowBridge requestHeaders are missing required Snow metadata.',
				{
					details: {missingHeaders},
				},
			);
		}

		const validations = [
			{
				headerName: 'x-snow-client',
				allowedValues: this.getRequiredSnowSourceValues('x-snow-client'),
				errorCode: 'bridge_source_client_forbidden',
			},
			{
				headerName: 'x-snow-protocol',
				allowedValues: this.getRequiredSnowSourceValues('x-snow-protocol'),
				errorCode: 'bridge_source_protocol_forbidden',
			},
			{
				headerName: 'x-snow-tool-mode',
				allowedValues: this.getAllowedSnowToolModes(),
				errorCode: 'bridge_source_tool_mode_forbidden',
			},
			{
				headerName: 'x-snow-channel',
				allowedValues: this.getRequiredSnowSourceValues('x-snow-channel'),
				errorCode: 'bridge_source_channel_forbidden',
			},
		];

		for (const validation of validations) {
			const {headerName, allowedValues, errorCode} = validation;
			if (allowedValues.size === 0) {
				continue;
			}

			const actualValue = headers[headerName];
			if (!allowedValues.has(actualValue)) {
				throw buildError(
					errorCode,
					`SnowBridge rejected request header "${headerName}" with value "${actualValue}".`,
					{
						details: {
							headerName,
							actualValue,
							allowedValues: Array.from(allowedValues),
						},
					},
				);
			}
		}
	}

	assertBridgeAccess(serverId, data) {
		if (this.config.Bridge_Enabled === false) {
			throw buildError('bridge_disabled', 'SnowBridge is disabled.');
		}

		const requiredToken = this.getBridgeAccessToken();
		const providedToken = String(
			(data && (data.accessToken || data.authToken)) || '',
		).trim();
		if (requiredToken && providedToken !== requiredToken) {
			throw buildError('bridge_auth_failed', 'Invalid bridge access token.');
		}

		this.assertSnowSourceMetadata(data);

		this.assertRateLimit(serverId, data);
	}

	assertRateLimit(serverId, data) {
		const identity = this.getClientIdentity(serverId, data);
		const limit = this.getRateLimitPerMinute();
		const now = Date.now();
		const state =
			this.rateLimitState.get(identity) || {
				windowStart: now,
				count: 0,
			};

		if (now - state.windowStart >= 60_000) {
			state.windowStart = now;
			state.count = 0;
		}

		state.count += 1;
		this.rateLimitState.set(identity, state);

		if (state.count > limit) {
			throw buildError(
				'bridge_rate_limited',
				`Bridge rate limit exceeded for client "${identity}".`,
				{limit},
			);
		}
	}

	isToolAllowed(toolName) {
		const allowedTools = this.getAllowedTools();
		if (allowedTools.size === 0) {
			return true;
		}

		return allowedTools.has(toolName);
	}

	normalizeToolFilters(rawFilters) {
		if (!rawFilters) {
			return [];
		}

		if (Array.isArray(rawFilters)) {
			return rawFilters.map(value => String(value).trim()).filter(Boolean);
		}

		if (typeof rawFilters === 'object' && rawFilters !== null) {
			if (Array.isArray(rawFilters.include)) {
				return rawFilters.include.map(value => String(value).trim()).filter(Boolean);
			}
			if (typeof rawFilters.include === 'string') {
				return splitCsv(rawFilters.include);
			}
		}

		if (typeof rawFilters === 'string') {
			return splitCsv(rawFilters);
		}

		return [];
	}

	matchesToolFilter(pluginName, displayName, bridgeCommands, filters) {
		if (!filters || filters.length === 0) {
			return true;
		}

		const haystacks = [
			pluginName,
			displayName,
			...bridgeCommands.map(command => command.commandName),
		]
			.filter(Boolean)
			.map(value => value.toLowerCase());

		return filters.some(filterValue => {
			const normalized = filterValue.toLowerCase();
			return haystacks.some(haystack => haystack.includes(normalized));
		});
	}

	buildExportablePlugin(plugin, pluginName) {
		const bridgeCommands = (plugin.capabilities?.invocationCommands || [])
			.map(normalizeInvocationCommand)
			.filter(Boolean);

		if (bridgeCommands.length === 0) {
			return null;
		}

		const bridgeCapabilities = this.getBridgeCapabilities();

		return {
			name: plugin.name || pluginName,
			publicName: plugin.name || pluginName,
			originName: pluginName,
			pluginType: plugin.pluginType,
			toolId: buildBridgeToolId(pluginName),
			displayName: plugin.displayName || plugin.name || pluginName,
			description: normalizeBridgeText(plugin.description),
			capabilityTags: buildCapabilityTags(bridgeCommands, bridgeCapabilities),
			capabilities: {
				invocationCommands: plugin.capabilities?.invocationCommands || [],
			},
			bridgeCommands,
		};
	}

	sendManifestError(serverId, requestId, error) {
		this.sendToServer(serverId, {
			type: 'vcp_manifest_response',
			data: {
				requestId,
				status: 'error',
				bridgeVersion: BRIDGE_VERSION,
				vcpVersion: BRIDGE_VERSION,
				capabilities: this.getBridgeCapabilities(),
				plugins: [],
				error,
			},
		});
	}

	sendToolError(serverId, requestId, invocationId, error) {
		this.sendToServer(serverId, {
			type: 'vcp_tool_result',
			data: buildToolResultPayload(
				{
					requestId,
					invocationId,
					toolName: '',
					publicName: '',
					toolId: undefined,
					taskId: null,
				},
				{
					status: 'error',
					error,
				},
			),
		});
	}

	async handleGetManifests(serverId, message, pluginManager) {
		const data = (message && message.data) || {};
		const requestId = data.requestId;

		try {
			this.assertBridgeAccess(serverId, data);

			const excludedTools = this.getExcludedTools();
			const excludedKeywords = this.getExcludedDisplayKeywords();
			const clientFilters = this.normalizeToolFilters(data.toolFilters);
			const exportablePlugins = [];

			for (const [pluginName, plugin] of pluginManager.plugins.entries()) {
				if (excludedTools.has(pluginName)) {
					continue;
				}

				if (!this.isToolAllowed(pluginName)) {
					continue;
				}

				if (plugin.isDistributed) {
					continue;
				}

				if (
					plugin.displayName &&
					excludedKeywords.some(keyword => plugin.displayName.includes(keyword))
				) {
					continue;
				}

				const exportablePlugin = this.buildExportablePlugin(plugin, pluginName);
				if (!exportablePlugin) {
					continue;
				}

				if (
					!this.matchesToolFilter(
						exportablePlugin.name,
						exportablePlugin.displayName,
						exportablePlugin.bridgeCommands,
						clientFilters,
					)
				) {
					continue;
				}

				exportablePlugins.push(exportablePlugin);
			}

			this.sendToServer(serverId, {
				type: 'vcp_manifest_response',
				data: {
					requestId,
					status: 'success',
					bridgeVersion: BRIDGE_VERSION,
					vcpVersion: BRIDGE_VERSION,
					capabilities: this.getBridgeCapabilities(),
					plugins: exportablePlugins,
				},
			});
		} catch (error) {
			this.sendManifestError(serverId, requestId, parseToolError(error));
		}
	}

	createInvocationContext(serverId, requestId, invocationId, toolName, bridgeMeta = {}) {
		return {
			serverId,
			requestId,
			invocationId,
			toolName,
			toolId: bridgeMeta.toolId || buildBridgeToolId(toolName),
			publicName: bridgeMeta.publicName || toolName,
			taskId: null,
			cancelled: false,
			cancelledAt: null,
			createdAt: Date.now(),
		};
	}

	cleanupInvocation(invocationId) {
		const context = this.activeInvocations.get(invocationId);
		if (!context) {
			return;
		}

		if (context.cancelCleanupTimer) {
			clearTimeout(context.cancelCleanupTimer);
		}

		if (context.taskId) {
			this.taskToInvocationMap.delete(context.taskId);
		}

		this.activeInvocations.delete(invocationId);
	}

	scheduleCancelledInvocationCleanup(invocationId) {
		const context = this.activeInvocations.get(invocationId);
		if (!context || context.cancelCleanupTimer) {
			return;
		}

		context.cancelCleanupTimer = setTimeout(() => {
			this.cleanupInvocation(invocationId);
		}, CANCELLED_INVOCATION_TTL_MS);
	}

	async handleExecuteTool(serverId, message, pluginManager) {
		const data = (message && message.data) || {};
		const requestId = data.requestId;
		const invocationId = data.invocationId || requestId;
		const toolName = data.originName || data.toolName;
		const toolId = data.toolId || buildBridgeToolId(toolName || '');
		const publicName = data.publicName || data.toolName || toolName;
		const toolArgs = data.toolArgs && typeof data.toolArgs === 'object'
			? {...data.toolArgs}
			: {};

		try {
			this.assertBridgeAccess(serverId, data);

			if (!requestId || !invocationId || !toolName) {
				throw buildError(
					'bridge_invalid_request',
					'requestId, invocationId and toolName are required.',
				);
			}

			if (!this.isToolAllowed(toolName)) {
				throw buildError(
					'bridge_tool_forbidden',
					`Tool "${toolName}" is not allowed by SnowBridge.`,
				);
			}

			const context = this.createInvocationContext(
				serverId,
				requestId,
				invocationId,
				toolName,
				{
					toolId,
					publicName,
				},
			);
			this.activeInvocations.set(invocationId, context);

			const result = await pluginManager.processToolCall(toolName, toolArgs);
			const latestContext = this.activeInvocations.get(invocationId);

			if (result && result.taskId) {
				const taskId = String(result.taskId);
				if (latestContext) {
					latestContext.taskId = taskId;
					this.taskToInvocationMap.set(taskId, invocationId);
					if (latestContext.cancelled) {
						this.scheduleCancelledInvocationCleanup(invocationId);
						return;
					}
				}

				this.sendToServer(serverId, {
					type: 'vcp_tool_status',
					data: buildAsyncStatusPayload(context, {
						taskId,
						state: 'accepted',
						status: 'accepted',
						event: 'lifecycle',
						result,
					}),
				});
				return;
			}

			if (latestContext && latestContext.cancelled) {
				this.cleanupInvocation(invocationId);
				return;
			}

			this.sendToServer(serverId, {
				type: 'vcp_tool_result',
				data: buildToolResultPayload(context, {
					status: 'success',
					result,
				}),
			});
		} catch (error) {
			const context = this.activeInvocations.get(invocationId);
			if (!context || !context.cancelled) {
				const parsedError = parseToolError(error);
				if (context) {
					this.sendToServer(serverId, {
						type: 'vcp_tool_result',
						data: buildToolResultPayload(context, {
							status: 'error',
							taskId: context.taskId,
							error: parsedError,
						}),
					});
				} else {
					this.sendToolError(serverId, requestId, invocationId, parsedError);
				}
			}
		} finally {
			const context = this.activeInvocations.get(invocationId);
			if (context && !context.taskId) {
				this.cleanupInvocation(invocationId);
			}
		}
	}

	async handleCancelTool(serverId, message) {
		const data = (message && message.data) || {};
		const requestId = data.requestId;
		const invocationId = data.invocationId || requestId;

		try {
			this.assertBridgeAccess(serverId, data);

			if (!invocationId) {
				throw buildError(
					'bridge_invalid_cancel',
					'requestId or invocationId is required for cancellation.',
				);
			}

			const context = this.activeInvocations.get(invocationId);
			if (!context) {
				this.sendToServer(serverId, {
					type: 'vcp_tool_cancel_ack',
					data: {
						requestId,
						invocationId,
						accepted: false,
						mode: 'unsupported',
						error: buildError(
							'bridge_invocation_not_found',
							`Invocation "${invocationId}" was not found.`,
						),
					},
				});
				return;
			}

			context.cancelled = true;
			context.cancelledAt = Date.now();
			this.scheduleCancelledInvocationCleanup(invocationId);

			this.sendToServer(serverId, {
				type: 'vcp_tool_cancel_ack',
				data: {
					requestId,
					invocationId,
					accepted: true,
					mode: context.taskId ? 'ignored' : 'cancelled',
				},
			});
		} catch (error) {
			this.sendToServer(serverId, {
				type: 'vcp_tool_cancel_ack',
				data: {
					requestId,
					invocationId,
					accepted: false,
					mode: 'unsupported',
					error: parseToolError(error),
				},
			});
		}
	}

	async processToolCall(args) {
		if (args.command === 'GetStatus') {
			return {
				status: 'running',
				hooked: this.isHooked,
				config: this.config,
				bridgeVersion: BRIDGE_VERSION,
				capabilities: this.getBridgeCapabilities(),
			};
		}

		throw new Error(`Unknown command: ${args.command}`);
	}

	shutdown() {
		this.removeEventListeners();
		this.removeMonkeyPatch();

		for (const context of this.activeInvocations.values()) {
			if (context.cancelCleanupTimer) {
				clearTimeout(context.cancelCleanupTimer);
			}
		}
		this.activeInvocations.clear();
		this.taskToInvocationMap.clear();
		this.rateLimitState.clear();
		this.pluginManager = null;
		this.wss = null;

		if (this.debugMode) {
			console.log('[SnowBridge] Shutting down...');
		}
	}
}

module.exports = new SnowBridge();
