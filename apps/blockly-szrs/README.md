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
  // Optional: zoomControlsContainer and modelSelectContainer, host elements to
  // render the controls into instead of floating over the workspace.
});
plugin.init();
```

The plugin needs a running [llm-proxy](../llm-proxy/README.md). Each site that uses the plugin runs its own proxy, with `CORS_ORIGINS` set to the site's origin. If the proxy has `INTERNAL_API_KEY` set, pass it as `proxy.apiKey`. It will be visible to anyone using the site, so it identifies the site rather than acting as a secret.

### Choosing a model

On `init()` the plugin asks the proxy for its model aliases (`GET /v1/models`, which LiteLLM limits to the models the proxy's virtual key may use). When there is more than one, a dropdown appears below the zoom controls. `proxy.model` is the default: it is used until the list arrives, and whenever the user's remembered choice is no longer offered. The user's choice is kept in `localStorage` (key `szrs.zoomModel`), and zoom results are cached per model, so switching back to a model doesn't ask the proxy again. If the list can't be fetched, there is no dropdown and zooms use `proxy.model`.

## API

<!--
  - TODO: describe the API.
  -->

## License

Apache 2.0
