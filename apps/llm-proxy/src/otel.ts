import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import pkg from '../package.json' with { type: 'json' };

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: 'llm-proxy',
		[ATTR_SERVICE_VERSION]: pkg.version,
		'deployment.environment': process.env.DEPLOYMENT_ENVIRONMENT ?? 'development'
	}),
	traceExporter: otlpEndpoint ? new OTLPTraceExporter({ url: otlpEndpoint }) : undefined,
	instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();

process.on('SIGTERM', () => {
	void sdk.shutdown().finally(() => process.exit(0));
});
