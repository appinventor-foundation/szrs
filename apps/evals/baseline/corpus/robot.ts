// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

/**
 * The host-neutrality slice: a toy robot block set with its own block types
 * and no core Blockly block in it (the same program as the dashboard's smoke
 * check). Nothing in the pipeline may depend on core block names or a fixed
 * vocabulary. The definitions are here so a headless workspace can load it; a
 * model is only ever sent the saved program.
 */
import type { Workspace } from './blocks.js';

const statement = { previousStatement: null, nextStatement: null, colour: 200 };

/** Blockly block definitions for the robot set. */
export const robotBlockDefs: Record<string, unknown>[] = [
	{
		type: 'robot_when_bumped',
		message0: 'when bumped on %1 %2 %3',
		args0: [
			{
				type: 'field_dropdown',
				name: 'SENSOR',
				options: [
					['front', 'front'],
					['back', 'back']
				]
			},
			{ type: 'input_dummy' },
			{ type: 'input_statement', name: 'DO' }
		],
		colour: 20
	},
	{
		type: 'robot_when_line_lost',
		message0: 'when the line is lost %1 %2',
		args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
		colour: 20
	},
	{
		type: 'robot_every',
		message0: 'every %1 seconds %2 %3',
		args0: [
			{ type: 'field_number', name: 'SECONDS', value: 1 },
			{ type: 'input_dummy' },
			{ type: 'input_statement', name: 'DO' }
		],
		colour: 20
	},
	{
		type: 'robot_drive',
		message0: 'drive %1 at %2',
		args0: [
			{
				type: 'field_dropdown',
				name: 'DIRECTION',
				options: [
					['forward', 'FORWARD'],
					['backward', 'BACKWARD']
				]
			},
			{ type: 'input_value', name: 'SPEED' }
		],
		...statement
	},
	{
		type: 'robot_speed',
		message0: 'speed %1 %',
		args0: [{ type: 'field_number', name: 'PERCENT', value: 50 }],
		output: null,
		colour: 120
	},
	{
		type: 'robot_turn',
		message0: 'turn %1 by %2 degrees',
		args0: [
			{
				type: 'field_dropdown',
				name: 'SIDE',
				options: [
					['left', 'LEFT'],
					['right', 'RIGHT']
				]
			},
			{ type: 'field_number', name: 'DEGREES', value: 90 }
		],
		...statement
	},
	{ type: 'robot_stop', message0: 'stop', ...statement },
	{
		type: 'robot_beep',
		message0: 'beep %1',
		args0: [
			{
				type: 'field_dropdown',
				name: 'TONE',
				options: [
					['low', 'LOW'],
					['high', 'HIGH']
				]
			}
		],
		...statement
	}
];

export const robot: Workspace = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'robot_when_bumped',
				x: 30,
				y: 30,
				fields: { SENSOR: 'front' },
				inputs: {
					DO: {
						block: {
							type: 'robot_drive',
							fields: { DIRECTION: 'BACKWARD' },
							inputs: {
								SPEED: { shadow: { type: 'robot_speed', fields: { PERCENT: 30 } } }
							},
							next: {
								block: { type: 'robot_turn', fields: { SIDE: 'LEFT', DEGREES: 90 } }
							}
						}
					}
				}
			},
			{
				type: 'robot_when_line_lost',
				x: 30,
				y: 230,
				inputs: {
					DO: {
						block: {
							type: 'robot_stop',
							next: { block: { type: 'robot_beep', fields: { TONE: 'LOW' } } }
						}
					}
				}
			},
			{
				type: 'robot_every',
				x: 30,
				y: 430,
				fields: { SECONDS: 5 },
				inputs: { DO: { block: { type: 'robot_beep', fields: { TONE: 'HIGH' } } } }
			}
		]
	},
	variables: []
} as unknown as Workspace;
