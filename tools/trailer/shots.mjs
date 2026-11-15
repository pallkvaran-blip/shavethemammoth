// The trailer's shots. query: how the page is opened (see the README's developer notes). seconds: how long it runs.
// before(d): once, when the scene is ready. direct(d, i, t, k): before every frame (frame number, seconds, 0 to 1).
export const SHOTS = {
  // the scissors at work on a foreleg, seen through the elf's eyes: hair comes away and falls
  snip: {
    query: 'elf=1.413,0.896,0.76,0.0&tool=scissors', seconds: 1.75, warm: 14,
    direct: (d, i, t) => {
      const s = d.g.shaving, n = i + (d.n = (d.n || 0) + 1) * 0;
      d.frame = (d.frame || 0) + 1;
      d.g.rig.keys.add('KeyW');
      d.g.rig.pitch = 0.22 + 0.16 * Math.sin(d.frame * 0.21);
      d.g.rig.yaw = 0.76 + 0.1 * Math.sin(d.frame * 0.13);
      s.squeeze(d.frame % 9 < 5);
    },
  },
  // the cave men, coming
  charge: {
    query: 'elf=3.4,3.0,2.4,0.1&raid=1.4', seconds: 1.6, warm: 2,
  },
  // the land, and him in it: a slow move in, low over the snow
  land: {
    query: 'cam=19,0.5,9,0.9,2.3,0&fov=38&el=5', seconds: 3.2, warm: 2,
    direct: (d, i, t, k) => d.dolly([19, 0.5, 9, 0.9, 2.3, 0, 38], [17.2, 0.5, 8.1, 0.9, 2.3, 0, 38], k),
  },
};
