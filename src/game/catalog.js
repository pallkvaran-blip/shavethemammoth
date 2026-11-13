// Everything Gnorman sells, what it costs and what it does. Prices are in gold;
// hair is weighed in grams, and Mortimer pays HAIR_PRICE a gram for it.
//
// The whole coat is about 84 kg. What can be reached from the snow with the
// scissors is worth a little over a thousand gold: enough for the shears, a
// broom, a sack and the first ladder. After that each purchase opens up more
// mammoth.

/** Gold for a gram of hair. */
export const HAIR_PRICE = 0.25;

export const SECTIONS = [
  { id: 'cutter', title: 'Sharp things', note: 'For taking it off.' },
  { id: 'sweeper', title: 'Picking it up', note: 'It does not sell itself from the snow.' },
  { id: 'ladder', title: 'Getting up there', note: 'He is taller than he looks, and he looks tall.' },
  { id: 'pack', title: 'Getting up there, with fire', note: 'No refunds. No next of kin, either, by the look of you.' },
  { id: 'upgrade', title: 'Improvements', note: 'The same, but more.' },
  { id: 'extra', title: 'Sundries', note: 'Things nobody needs. Priced accordingly.' },
];

export const ITEMS = {
  // ---- sharp things (their workings are in src/game/tools/) ----
  scissors: { kind: 'cutter', name: 'Small bad scissors', price: 0, blurb: 'Yours already. I would not take them back.' },
  sheep: { kind: 'cutter', name: 'Shears', price: 60, blurb: 'Sprung steel. Three thousand years on sheep and not one thank-you note.' },
  garden: { kind: 'cutter', name: 'Garden clippers', price: 220, blurb: 'For hedges. A mammoth is a hedge with opinions.' },
  shaver: { kind: 'cutter', name: 'Beard shaver', price: 450, blurb: 'Takes him down to the skin, where the reading matter is. One careful owner. He is no longer with us.' },
  electric: { kind: 'cutter', name: 'Electric shears', price: 900, blurb: 'A strip as wide as your head with every pass. Batteries included; his consent is not.' },

  // ---- picking it up ----
  hands: { kind: 'sweeper', name: 'Bare hands', price: 0, blurb: 'You came with these.', sweep: { radius: 0.13, ahead: 0.14, every: 0.45 } },
  twig: { kind: 'sweeper', name: 'Twig broom', price: 40, blurb: 'A stick with ambitions. Sweeps a patch the size of a dinner plate.', sweep: { radius: 0.26, ahead: 0.3, every: 0.5 } },
  push: { kind: 'sweeper', name: 'Push broom', price: 160, blurb: 'Half a metre of bristle. The widow who sold it to me said he died doing what he loved: sweeping.', sweep: { radius: 0.46, ahead: 0.42, every: 0.55 } },
  handvac: { kind: 'sweeper', name: "Lil' Sucker hand vacuum", price: 500, blurb: 'It sucks, and that is the nicest thing anyone has said about it. Hold it down and wave it about.', sweep: { radius: 0.55, ahead: 0.5, pull: 3.2 } },
  shopvac: { kind: 'sweeper', name: 'Hoovermax 9000 "Widowmaker"', price: 1400, blurb: 'Lifts hair from two paces. Do not point it at anything you are fond of.', sweep: { radius: 1.25, ahead: 0.95, pull: 5 } },

  // ---- getting up there ----
  crate: { kind: 'ladder', name: 'Milk crate', price: 35, blurb: 'Stand on it. That is the whole product.', climb: { top: 0.45, lean: 0 } },
  step: { kind: 'ladder', name: 'Step ladder', price: 140, blurb: 'Gets you to his knees, where the conversation is better.', climb: { top: 1.05, lean: 0.18 } },
  painter: { kind: 'ladder', name: "Painter's ladder", price: 420, blurb: 'Reaches the belly. Spattered with paint and, I am told, the painter.', climb: { top: 2.05, lean: 0.2 } },
  fire: { kind: 'ladder', name: 'Fire brigade ladder', price: 1100, blurb: 'All the way to the top of his head. Fell off the back of a fire. Engine. Off the back of a fire engine.', climb: { top: 3.75, lean: 0.22 } },

  // ---- with fire ----
  soda: { kind: 'pack', name: 'Fizzy-pop rocket belt', price: 700, blurb: 'Two bottles and a belt. Shake well. Lands you on your arse about half the time, which is the fun half.', fly: { thrust: 15, tank: 2.4, refill: 0.5, air: 0 } },
  blower: { kind: 'pack', name: 'Leaf-blower pack', price: 1600, blurb: 'Two leaf blowers and a rucksack. Loud enough to make him flinch. Six seconds up, then physics.', fly: { thrust: 17, tank: 6, refill: 0.45, air: 0 } },
  jet: { kind: 'pack', name: 'Icarus Mk II jet pack', price: 3200, blurb: 'A proper one. Hovers. The Mk I is why I have this hat and not the other hat.', fly: { thrust: 21, tank: 16, refill: 1.2, air: 0.12 } },

  // ---- improvements ----
  sack: {
    kind: 'upgrade', name: 'Somewhere to put it', blurb: 'Your pockets hold a hundred grams. That is a moustache.',
    levels: [
      { name: 'Sack', price: 50, blurb: 'Holds 350 g. Smells of the last thing that was in it.' },
      { name: 'Wheelbarrow', price: 240, blurb: 'Holds 1.2 kg. Squeaks, but so do you.' },
      { name: 'Bottomless sack', price: 800, blurb: 'Holds 5 kg. Do not look inside. It looks back.' },
    ],
  },
  suck: {
    kind: 'upgrade', name: 'More suck', needs: ['handvac'], blurb: 'For either vacuum. I bore the pipe out with a spoon.',
    levels: [
      { name: 'More suck', price: 300, blurb: 'A third more reach.' },
      { name: 'Indecent suck', price: 700, blurb: 'Two thirds more reach. Hold on to your eyebrows.' },
    ],
  },
  tank: {
    kind: 'upgrade', name: 'Bigger tank', needs: ['soda'], blurb: 'For any pack. More of whatever is in there.',
    levels: [
      { name: 'Bigger tank', price: 400, blurb: 'Half as long again in the air.' },
      { name: 'Irresponsible tank', price: 900, blurb: 'Twice as long in the air. Twice the crater.' },
    ],
  },

  // ---- sundries ----
  tonic: { kind: 'extra', name: "Gnorman's Miracle Regrowth Tonic", price: 150, again: true, blurb: 'Pour it on him and it all grows back by morning. It is morning. He will be furious, and fluffy.' },
  loyal: { kind: 'extra', name: 'Loyalty card', price: 120, flag: 'loyal', blurb: 'A tenth off everything, for ever. Every tenth stamp I judge you silently.' },
  foot: { kind: 'extra', name: "Lucky rabbit's foot", price: 200, flag: 'foot', blurb: 'Mortimer pays 15% more when you carry it. Not lucky for the rabbit, but then what is.' },
  cocoa: { kind: 'extra', name: 'Thermos of cocoa', price: 90, flag: 'cocoa', blurb: 'You walk a quarter faster. Mostly sugar. Partly something I found.' },
};

/** Things in a section, in the order the stall shows them. */
export const inSection = (kind) => Object.entries(ITEMS).filter(([, item]) => item.kind === kind && item.price !== 0).map(([id]) => id);
