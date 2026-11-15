// Everything Gnorman sells, what it costs and what it does. Prices are in gold;
// hair is weighed in grams, and Mortimer pays HAIR_PRICE a gram for it.
//
// How the prices were set. The whole coat is about 70 kg (17,500 gold). Of
// that, 2 kg grows where it can be reached from the snow, another 5 kg within
// reach of the milk crate, and the rest from the fire ladder or the air.
// Working steadily round a foreleg an elf takes about 2 grams a second with
// the bad scissors, 3.5 with the shears and 4 with the garden clippers
// (tools/loop-test.mjs measures the first; all of them do better where the
// hair is longer), and as much as he can run a comb 14 cm wide through with
// the electric shears. So: a pocketful (100 g, under a minute of bad scissors)
// buys the shears and the broom; what grows near the ground pays for the
// crate, the ladder and the clippers; and after that each purchase opens up
// more mammoth than it cost. There is one of each kind of thing and then a
// better one, and the better one costs what the middling ones used to.
// (The scissors were a quarter as good once, and three minutes of them bought
// nothing. Nobody enjoyed it.)
//
// The hired help. A lemming gnaws about three quarters of a gram a second
// where the hair is long (a third of the bad scissors, a fifth of the
// shears) and finds its own way to wherever any is left, which is what it
// is for: the last patches are hard to find. One earns its 60 gold back in the
// first six minutes if somebody picks up after it; thirty of them take about
// an hour over a whole mammoth, and a few minutes over what an elf has left
// of one; two hundred and forty, eight minutes over all of him.

// The novelties. Each is used once, on one part of him, and pays about three
// times what it cost, in gold that has to be picked up from wherever it came
// out of him; all ten together are worth about 1,300 gold more than they cost
// (a fourteenth of the coat). The spray is the odd one: what it pays is the
// hair it takes off, which has still to be picked up and sold. Measured: 0.4
// kilos held still (half its price), about two up and down a leg, and four
// to six swept along his flank or under his belly, which is five minutes'
// work with good clippers. A new coat (the tonic) puts all of them back on sale.
//
// The cave men are what they are.

/** Gold for a gram of hair. */
export const HAIR_PRICE = 0.25;
/** As many helpers as he has room for. */
export const MOST_HELP = 240;

export const SECTIONS = [
  { id: 'cutter', title: 'Sharp things', note: 'For taking it off.' },
  { id: 'sweeper', title: 'Picking it up', note: 'It does not sell itself from the snow.' },
  { id: 'ladder', title: 'Getting up there', note: 'He is taller than he looks, and he looks tall.' },
  { id: 'pack', title: 'Getting up there, with fire', note: 'No refunds. No next of kin, either, by the look of you.' },
  { id: 'help', title: 'Hired help', note: 'They work for crumbs. The crumbs are extra.' },
  { id: 'gag', title: 'Remedies and novelties', note: 'Each works once, on him. What he does about it is between the two of you.' },
  { id: 'upgrade', title: 'Improvements', note: 'The same, but more.' },
  { id: 'extra', title: 'Sundries', note: 'Things nobody needs. Priced accordingly.' },
];

export const ITEMS = {
  // ---- sharp things (their workings are in src/game/tools/) ----
  scissors: { kind: 'cutter', name: 'Small bad scissors', price: 0, blurb: 'Yours already. I would not take them back.', got: 'They are small. They are bad. They are all you have.' },
  sheep: { kind: 'cutter', name: 'Shears', price: 15, blurb: 'Sprung steel. Three thousand years on sheep and not one thank-you note.', got: 'Sprung steel! Somewhere, a sheep shudders and does not know why.' },
  garden: { kind: 'cutter', name: 'Garden clippers', price: 120, blurb: 'For hedges. A mammoth is a hedge with opinions.', got: 'They are bigger than you are. This will be fine.' },
  electric: { kind: 'cutter', name: 'Electric shears', price: 300, blurb: 'Bigger than you are. A strip as wide as a doorway with every pass. Batteries included; his consent is not.', got: 'The power of a large kitchen appliance is yours.' },

  // ---- picking it up ----
  // (hands take a pinch at a time, `most` grams, from a small patch: it is what makes a broom worth ten gold)
  hands: { kind: 'sweeper', name: 'Bare hands', price: 0, blurb: 'You came with these. A pinch at a time.', sweep: { radius: 0.13, ahead: 0.22, every: 0.45, most: 1.5 } },
  push: { kind: 'sweeper', name: 'Push broom', price: 10, blurb: 'Half a metre of bristle. The widow who sold it to me said he died doing what he loved: sweeping.', sweep: { radius: 0.46, ahead: 0.42, every: 0.55 } },
  shopvac: { kind: 'sweeper', name: 'Hoovermax 9000 "Widowmaker"', price: 350, blurb: 'Lifts hair from two paces. Do not point it at anything you are fond of.', sweep: { radius: 1.25, ahead: 0.95, pull: 5 } },

  // ---- getting up there ----
  crate: { kind: 'ladder', name: 'Milk crate', price: 20, blurb: 'Stand on it. That is the whole product.', climb: { top: 0.45, lean: 0 } },
  fire: { kind: 'ladder', name: 'Fire brigade ladder', price: 90, blurb: 'All the way to the top of his head. Fell off the back of a fire. Engine. Off the back of a fire engine.', climb: { top: 3.75, lean: 0.22 } },

  // ---- with fire ----
  jet: { kind: 'pack', name: 'Icarus Mk II jet pack', price: 500, blurb: 'A proper one. Hovers. The Mk I is why I have this hat and not the other hat.', fly: { thrust: 9.6, tank: 16, refill: 2, air: 0.12 } },

  // ---- hired help (what they do is in src/game/helpers.js): as many as you like, as often as you like ----
  lemming: { kind: 'help', name: 'A lemming', price: 60, again: true, hire: 1, blurb: 'Climbs. Gnaws. Finds the bits you missed. Has no idea what a mammoth is and is not going to be told.' },
  lemmings: { kind: 'help', name: 'Half a dozen lemmings', price: 320, again: true, hire: 6, blurb: 'They work better in company. They do everything better in company. That is the trouble with lemmings.' },
  plague: { kind: 'help', name: 'A plague of lemmings', price: 1400, again: true, hire: 30, blurb: 'Thirty. I counted twice and got thirty once. He will be bald by supper and you will not have lifted a finger.' },
  // (what comes of these is in src/game/raid.js. It is not what Gnorman says.)
  cavemen: { kind: 'help', name: 'Cave men', price: 150, again: true, raid: true, blurb: 'Four of them, with spears. Professional hunters. They will have him down and skinned by teatime. No refunds.' },

  // ---- remedies and novelties (what they do is in src/game/gags.js, how they look in tools/novelties.js): each is held like
  //      a tool and used once, where `use` says; `pays` is the gold that comes out of him ----
  feather: { kind: 'gag', name: 'Tickling feather', price: 25, pays: 80, use: 'Tickle one of his legs with it.', blurb: 'From a bird that will not be needing it. He is ticklish about the legs. Everybody is ticklish somewhere.' },
  nosespray: { kind: 'gag', name: 'Trunk-Eze nose spray', price: 35, pays: 110, use: 'Squirt it up the end of his trunk.', blurb: 'One squirt clears a nose two metres long. Stand to one side. I cannot stress the side enough.' },
  scratcher: { kind: 'gag', name: 'Telescopic belly scratcher', price: 45, pays: 140, use: 'Stand under him, look up, and scratch his belly.', blurb: 'A little wooden hand on a very long stick. He cannot reach his own belly. Ten thousand years of itch.' },
  varnish: { kind: 'gag', name: 'Toenail varnish, Harlot Red', price: 50, pays: 130, use: 'Paint the toenails of any of his feet.', blurb: 'One coat, eighteen nails. He has never once seen his own feet. Tell him they look lovely.' },
  tarot: { kind: 'gag', name: 'Tarot cards', price: 60, pays: 170, use: 'Stand in front of him, where he can see you, and deal.', blurb: 'A full deck, bar the ones I lost. Read him his future. Do not tell him how you know.' },
  plunger: { kind: 'gag', name: 'Trunk plunger', price: 70, pays: 190, use: 'Put it on the end of his trunk and pump.', blurb: 'For blockages. It is the longest nose in the world and nobody has ever looked up it.' },
  needles: { kind: 'gag', name: 'Acupuncture needles', price: 100, pays: 280, use: 'Throw all five into him. Anywhere will do.', blurb: 'Five. Ancient eastern medicine, from a man to the east of here. Stick them in anywhere; that is how it works.' },
  polish: { kind: 'gag', name: 'Tusk shiner', price: 120, pays: 320, use: 'Buff one of his tusks with it.', blurb: 'A ball of lambswool on a stick, and a tin of something. Brings ivory up like a new tooth.' },
  watch: { kind: 'gag', name: 'Hypnotist’s watch', price: 160, pays: 440, use: 'Stand in front of him and swing it where he can see.', blurb: 'Swing it before his eyes and suggest something. I take no responsibility for what you suggest.' },
  depil: { kind: 'gag', name: 'Coat-Off hair remover', price: 200, use: 'Spray it on his coat and keep it moving. What falls off is yours to pick up.', blurb: 'One can. Whatever it touches falls out in handfuls. Do not get it on your eyebrows. I did.' },

  // ---- improvements ----
  suck: {
    kind: 'upgrade', name: 'More suck', needs: ['shopvac'], blurb: 'For the vacuum. I bore the pipe out with a spoon.',
    levels: [
      { name: 'More suck', price: 250, blurb: 'A third more reach.' },
      { name: 'Indecent suck', price: 600, blurb: 'Two thirds more reach. Hold on to your eyebrows.' },
    ],
  },
  tank: {
    kind: 'upgrade', name: 'Bigger tank', needs: ['jet'], blurb: 'For the jet pack. More of whatever is in there.',
    levels: [
      { name: 'Bigger tank', price: 350, blurb: 'Half as long again in the air.' },
      { name: 'Irresponsible tank', price: 800, blurb: 'Twice as long in the air. Twice the crater.' },
    ],
  },

  // ---- sundries ----
  tonic: { kind: 'extra', name: "Gnorman's Miracle Regrowth Tonic", price: 150, again: true, blurb: 'Pour it on him and it all grows back by morning. It is morning. He will be furious, and fluffy.' },
  loyal: { kind: 'extra', name: 'Loyalty card', price: 100, flag: 'loyal', blurb: 'A tenth off everything, for ever. Every tenth stamp I judge you silently.' },
  foot: { kind: 'extra', name: "Lucky rabbit's foot", price: 150, flag: 'foot', blurb: 'Mortimer pays 15% more when you carry it. Not lucky for the rabbit, but then what is.' },
  cocoa: { kind: 'extra', name: 'Thermos of cocoa', price: 60, flag: 'cocoa', blurb: 'You walk a quarter faster. Mostly sugar. Partly something I found.' },
  box: { kind: 'extra', name: 'Mystery box', price: 40, again: true, blurb: 'Could be anything. Has been, mostly, a sock.' },
  partyhat: { kind: 'extra', name: 'Party hat (for him)', price: 80, wear: 'partyhat', blurb: 'He has not been to a party since the Pleistocene. Nobody came to that one either.' },
  shades: { kind: 'extra', name: 'Sunglasses (for him)', price: 140, wear: 'shades', blurb: 'So that he does not have to watch what you are doing to him.' },
  pinkdye: { kind: 'extra', name: 'A bucket of pink', price: 400, flag: 'pink', blurb: 'Does one mammoth, all over, until the tonic grows it out. Mortimer pays a fifth more for pink. Nobody has asked him why.' },
};

/** Things in a section, in the order the stall shows them. */
export const inSection = (kind) => Object.entries(ITEMS).filter(([, item]) => item.kind === kind && item.price !== 0).map(([id]) => id);
