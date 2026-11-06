// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// A program in a block set the host defines itself (a toy robot), with no core
// Blockly block in it. The demo runner cannot load it, since it registers only
// core blocks, so smoke-zoom.ts sends it straight to the proxy. It checks that
// the outline and the plan work without knowing any block type, which is what
// a second host would need. Three separate stacks, so three concepts.
export const customBlockSet = {
	blocks: {
		languageVersion: 0,
		blocks: [
			{
				type: 'robot_when_bumped',
				id: 'bump',
				fields: { SENSOR: 'front' },
				inputs: {
					DO: {
						block: {
							type: 'robot_drive',
							id: 'back-off',
							fields: { DIRECTION: 'BACKWARD' },
							inputs: {
								SPEED: {
									shadow: { type: 'robot_speed', id: 'back-speed', fields: { PERCENT: 30 } }
								}
							},
							next: {
								block: {
									type: 'robot_turn',
									id: 'turn-away',
									fields: { SIDE: 'LEFT', DEGREES: 90 }
								}
							}
						}
					}
				}
			},
			{
				type: 'robot_when_line_lost',
				id: 'lost',
				inputs: {
					DO: {
						block: {
							type: 'robot_stop',
							id: 'halt',
							next: { block: { type: 'robot_beep', id: 'warn', fields: { TONE: 'LOW' } } }
						}
					}
				}
			},
			{
				type: 'robot_every',
				id: 'tick',
				fields: { SECONDS: 5 },
				inputs: { DO: { block: { type: 'robot_beep', id: 'ping', fields: { TONE: 'HIGH' } } } }
			}
		]
	},
	variables: []
};
