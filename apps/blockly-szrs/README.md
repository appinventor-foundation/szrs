# blockly-blockly-szrs [![Built on Blockly](https://tinyurl.com/built-on-blockly)](https://github.com/google/blockly)

<!--
  - TODO: Edit plugin description.
  -->

A [Blockly](https://www.npmjs.com/package/blockly) plugin that provides different representations of a set of blocks

## Installation

### Yarn

```
yarn add blockly-blockly-szrs
```

### npm

```
npm install blockly-blockly-szrs --save // TODO: this will be a different package
```

## Usage

<!--
  - TODO: Update usage.
  -->

```js
import * as Blockly from 'blockly';
import { SemanticZoomPlugin } from 'blockly-blockly-szrs';

// Inject Blockly.
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: toolboxCategories
});

// Initialize plugin.
const plugin = new SemanticZoomPlugin(workspace, {
  // This site's llm-proxy (apps/llm-proxy), and the LiteLLM model alias to use.
  proxy: { proxyUrl: 'https://proxy.example.org', model: 'gpt-4o-mini' },
  // A name for the program; it becomes the prefix of generated block types.
  getSlug: () => 'fizz-buzz-n'
});
plugin.init();
```

The plugin needs a running [llm-proxy](../llm-proxy/README.md). Each site that uses the plugin runs its own proxy, with `CORS_ORIGINS` set to the site's origin. If the proxy has `INTERNAL_API_KEY` set, pass it as `proxy.apiKey`. It will be visible to anyone using the site, so it identifies the site rather than acting as a secret.

## API

<!--
  - TODO: describe the API.
  -->

## License

Apache 2.0
