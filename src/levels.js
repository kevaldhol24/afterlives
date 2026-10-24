// Single-screen rooms, 960x540. Ground top is usually y=460.
// solids:  [x, y, w, h]
// spikes:  [x, y(top), w, h]
// plates:  spirit plates — pressed only by ghosts. { id, x, y(ground top), w }
// doors:   open while their plate is pressed. { plate, x, y, w, h }
// deaths:  how many bodies you can leave in this room
// ghosts:  whether past lives replay in this room

export const LEVELS = [
  {
    name: 'The Pit',
    deaths: 3,
    ghosts: false,
    spawn: { x: 80, y: 460 },
    solids: [
      [0, 460, 300, 80],
      [560, 460, 400, 80],
      [300, 532, 260, 8],
    ],
    spikes: [[300, 508, 260, 24]],
    plates: [],
    doors: [],
    exit: { x: 890, y: 460 },
    hint: {
      key: 'Arrows move · Space jumps · R restarts',
      touch: 'Some gaps ask for more than a jump.',
    },
    hint2: 'Some gaps ask for more than a jump.',
  },
  {
    name: 'The Wall',
    deaths: 3,
    ghosts: false,
    spawn: { x: 80, y: 460 },
    solids: [
      [0, 460, 960, 80],
      [600, 320, 360, 140],
    ],
    spikes: [],
    plates: [],
    doors: [],
    exit: { x: 900, y: 320 },
    hint: {
      key: 'Q gives up your body. It stays where you fall.',
      touch: 'The skull gives up your body. It stays where you fall.',
    },
  },
  {
    name: 'Blue Stone',
    deaths: 3,
    ghosts: true,
    spawn: { x: 60, y: 460 },
    solids: [[0, 460, 960, 80]],
    spikes: [],
    plates: [{ id: 'a', x: 170, y: 460, w: 64 }],
    doors: [{ plate: 'a', x: 700, y: 0, w: 28, h: 460 }],
    exit: { x: 880, y: 460 },
    hint: {
      key: 'Your last life walks again. Blue stones answer only to ghosts.',
      touch: 'Your last life walks again. Blue stones answer only to ghosts.',
    },
  },
  {
    name: 'Both Worlds',
    deaths: 5,
    ghosts: true,
    spawn: { x: 70, y: 460 },
    solids: [
      [0, 460, 260, 80],
      [520, 460, 440, 80],
      [260, 532, 260, 8],
      [800, 320, 160, 140],
    ],
    spikes: [[260, 508, 260, 24]],
    plates: [{ id: 'a', x: 560, y: 460, w: 64 }],
    doors: [{ plate: 'a', x: 700, y: 0, w: 28, h: 460 }],
    exit: { x: 905, y: 320 },
    hint: {
      key: 'Only your last three lives walk again.',
      touch: 'Only your last three lives walk again.',
    },
  },
];
