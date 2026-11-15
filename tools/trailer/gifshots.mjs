// The shots for the gifs, by sitting: one page is opened for each sitting, and its shots are taken one after another.
// query: how the page is opened. Each shot: name; frames (at 12 a second); skip: frames of time let pass first, unseen;
// setup(d): once; direct(d, i, k): before every frame (frame number, negative while skipping; 0 to 1 through the shot).
export const SESSIONS = {
  // the game as it is played: through the elf's eyes
  play: {
    query: 'elf=6.0,2.6,1.143,0.27&tool=scissors&unlock&noscene',
    segments: [
      { name: 'walk', frames: 18, skip: 3,
        setup: (d) => d.elf(5.6, 2.4, d.towards(5.6, 2.4, 0.4, 0), 0.24),
        direct: (d) => d.keys('KeyW') },
      { name: 'snip', frames: 18, skip: 4,
        setup: (d) => d.elf(1.413, 0.896, 0.76, 0.05),
        direct: (d, i) => { d.keys('KeyW'); d.g.rig.pitch = 0.2 + 0.16 * Math.sin(i * 0.5); d.g.rig.yaw = 0.76 + 0.1 * Math.sin(i * 0.3); d.g.shaving.squeeze(((i + 40) % 5) < 3); } },
      { name: 'mow', frames: 26, skip: 8,
        setup: (d) => { d.g.game.choose('electric'); d.elf(1.5, 0.98, 0.76, -0.3); },
        direct: (d, i, k) => { d.keys('KeyW'); d.g.rig.pitch = -0.3 + 0.95 * k; d.g.rig.yaw = 0.76 + 0.16 * Math.sin(i * 0.45); d.g.shaving.squeeze(i >= -2); } },
      { name: 'mow2', frames: 20, skip: 3,
        setup: (d) => d.elf(-1.22, 1.3, 0, -0.25),
        direct: (d, i, k) => { d.keys('KeyW'); d.g.rig.pitch = -0.25 + 0.8 * k; d.g.rig.yaw = 0.3 * Math.sin(i * 0.5); d.g.shaving.squeeze(i >= -1); } },
      { name: 'vacuum', frames: 20, skip: 8,
        setup: (d) => { d.g.game.choose('shopvac'); d.elf(1.95, 1.45, d.towards(1.95, 1.45, 1.2, 0.8), -0.5); },
        direct: (d, i) => { d.g.rig.yaw = d.towards(1.95, 1.45, 1.2, 0.8) + 0.35 * Math.sin(i * 0.4); d.g.rig.pitch = -0.5 + 0.12 * Math.sin(i * 0.3); d.g.shaving.squeeze(i >= -3); } },
      { name: 'ladder', frames: 22, skip: 8,
        setup: (d) => { d.g.game.choose('garden'); d.g.game.use('fire'); d.elf(1.95, 1.0, 1.137, -0.25); },
        direct: (d, i) => { d.keys(...(i < 13 ? ['KeyR'] : [])); d.g.shaving.squeeze(i >= 13 && ((i % 5) < 3)); d.g.rig.pitch = -0.25 + (i >= 13 ? 0.1 * Math.sin(i * 0.6) : 0); },
        after: (d) => { const r = d.g.rig; r.height = 0; r.ladder = null; r.onLift('away'); } },
      { name: 'jet', frames: 24, skip: 6,
        setup: (d) => { d.g.game.choose('electric'); d.g.game.use('jet'); d.elf(3.8, -3.1, d.towards(3.8, -3.1, 0.2, 0), 0.1); },
        direct: (d, i, k) => { d.keys(...(i >= 0 ? ['KeyR'] : [])); d.g.rig.pitch = 0.1 - 0.55 * k; },
        after: (d) => { const r = d.g.rig; r.height = 0; r.vy = 0; } },
      { name: 'gnorman', frames: 16, skip: 4,
        setup: (d) => { const p = d.g.game.people.gnome; d.elf(p.x + 2.4, p.z + 1.7, d.towards(p.x + 2.4, p.z + 1.7, p.x, p.z), 0.12); },
        direct: (d) => d.keys('KeyW') },
      { name: 'mortimer', frames: 14, skip: 3,
        setup: (d) => { const p = d.g.game.people.vulture, x = p.front[0] + (p.front[0] - p.x) * 3.2, z = p.front[1] + (p.front[1] - p.z) * 3.2; d.elf(x, z, d.towards(x, z, p.x, p.z), 0.14); },
        direct: (d) => d.keys('KeyW') },
    ],
  },
  // him, from outside: as he is, with company, dressed up, and with nothing on
  beauty: {
    query: 'cam=15,1.0,8,0.6,2.2,0&fov=34&unlock&noscene',
    segments: [
      { name: 'wide', frames: 20, skip: 2, direct: (d, i, k) => d.dolly([15, 1.0, 8, 0.6, 2.2, 0, 34], [12.2, 1.5, 6.3, 0.6, 2.2, 0, 34], k) },
      { name: 'lemmings', frames: 18, skip: 14,
        setup: (d) => { d.g.state.helpers = 160; d.g.game.helpers.settle(160); },
        direct: (d, i, k) => d.dolly([4.6, 1.5, 3.9, 0.4, 1.6, 0.5, 34], [3.7, 1.7, 3.3, 0.4, 1.7, 0.5, 34], k) },
      { name: 'pink', frames: 18, skip: 2,
        setup: (d) => { const g = d.g; g.state.helpers = 0; g.game.helpers.dismiss(); g.state.worn.push('partyhat', 'shades'); g.antics.dress(); g.state.flags.pink = true; g.antics.dye(); },
        direct: (d, i, k) => d.dolly([7.6, 2.2, 2.6, 1.6, 2.3, 0, 30], [6.6, 2.4, 4.6, 1.6, 2.3, 0, 30], k) },
      { name: 'bald', frames: 24, skip: 2,
        setup: (d) => { const m = d.g.mammoth; m.setHaircut(new Float32Array(m.bodyCut.length).fill(0.0005)); },
        direct: (d, i, k) => d.dolly([-4.2, 3.4, 2.8, -1.3, 2.0, 0, 38], [-5.4, 2.5, -1.2, -1.3, 1.9, 0, 38], k) },
    ],
  },
  // the cave men: coming, arrived, and sorry
  raid: {
    query: 'elf=3.4,3.0,2.4,0.1&raid=1.2&unlock&noscene',
    segments: [
      { name: 'charge', frames: 18 },
      { name: 'standoff', frames: 16, skip: 28 },
      { name: 'sorry', frames: 14, skip: 50 },
    ],
  },
  // a new tool, held up for everybody to see
  got: {
    query: 'elf=2.3,1.75,0,0&gold=5000',
    segments: [
      { name: 'got', frames: 30, skip: 9, setup: (d) => d.g.game.buy('electric') },
    ],
  },
  // for the cover: him as he is in the game, his eye a little larger than life and on whoever is holding the scissors,
  // seen through the elf's eyes with the scissors in the corner of the picture. One frame each.
  cover: {
    query: 'elf=5.0,0.0,1.5708,0.0&tool=scissors&unlock&noscene',
    segments: [
      { name: 'glance', frames: 1, skip: 10,
        setup: (d) => {
          const g = d.g, m = g.mammoth;
          for (const e of m.eyes) e.mesh.scale.setScalar(1.6);
          const update = m.update.bind(m);
          m.update = (dt) => { update(dt); m.bone('head').rotation.z += 0.05; };       // (his head a little back)
          d.view = (x, z, up, pitch, fov, tx = 2.4, tz = 0) => { d.elf(x, z, d.towards(x, z, tx, tz), pitch); g.rig.height = up; g.rig.vy = 0; g.camera.fov = fov; g.camera.updateProjectionMatrix(); };
        },
        direct: (d) => d.view(4.9, 2.5, 2.2, 0.0, 44, 2.3, 0.3) },
      { name: 'whole', frames: 1, skip: 3, direct: (d) => d.view(6.6, 3.6, 0, 0.3, 56, 0.6, 0) },
      { name: 'under', frames: 1, skip: 3, direct: (d) => d.view(4.6, 2.3, 0, 0.62, 56, 2.3, 0.3) },
    ],
  },
};
