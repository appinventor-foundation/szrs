import { config } from '@szrs/eslint-config';

export default [
	...config,
	{
		// blockly-scripts runs the mocha tests as CommonJS, so they have to use require().
		files: ['test/**/*.mocha.js'],
		rules: { '@typescript-eslint/no-require-imports': 'off' }
	}
];
