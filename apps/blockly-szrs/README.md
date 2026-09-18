# blockly-blockly-szrs [![Built on Blockly](https://tinyurl.com/built-on-blockly)](https://github.com/google/blockly)

<!--
  - TODO: Edit plugin description.
  -->

A [Blockly](https://www.npmjs.com/package/blockly) plugin that ...

## Installation

### Yarn

```
yarn add blockly-blockly-szrs
```

### npm

```
npm install blockly-blockly-szrs --save
```

## Usage

<!--
  - TODO: Update usage.
  -->

```js
import * as Blockly from 'blockly';
import {Plugin} from 'blockly-blockly-szrs';

// Inject Blockly.
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: toolboxCategories,
});

// Initialize plugin.
const plugin = new Plugin(workspace);
plugin.init();
```

## API

<!--
  - TODO: describe the API.
  -->

## License

Apache 2.0
