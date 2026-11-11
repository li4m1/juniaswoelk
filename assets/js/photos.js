/* =====================================================================
   CONTENT — the only file you edit to change what the site shows.

   Photographs are added by dropping files into  originals/<NN Series name>/
   and running   node tools/import.mjs   — that fills in w / h / tone and
   writes the three image sizes. Everything you type by hand in here
   (alt, title, place, year, spec, series notes) survives a re-import.

   Per photograph you may add:  title: "…",  place: "…",  year: "…"
   Per series you may add:      kicker: "…", year: "…", note: "…"
   ===================================================================== */

window.JW_SITE = {
  name: "Junias Wölk",
  role: "Photographer",
  city: "Hamburg",
  lat: 53.5511,
  lon: 9.9937,
  instagram: "juniaswoelk",
  email: "",
  placeholder: true
};

window.JW_SERIES = [
  { id: "waterline", title: "Waterline", kicker: "Harbour & coast", year: "2025" },
  { id: "structures", title: "Structures", kicker: "Architecture", year: "2025" },
  { id: "after-hours", title: "After Hours", kicker: "Night", year: "2024" },
  { id: "figures", title: "Figures", kicker: "People", year: "2025" },
  { id: "rooms", title: "Rooms", kicker: "Interiors", year: "2024" },
  { id: "outland", title: "Outland", kicker: "Landscape", year: "2026" }
];

window.JW_PHOTOS = [
  { id: "waterline-01", series: "waterline", w: 2400, h: 1600, tone: "#808397", alt: "Floating harbour crane moored on calm water at dusk", spec: "35 mm · f/5.6 · 1/125 s · ISO 200" },
  { id: "waterline-02", series: "waterline", w: 2106, h: 1534, tone: "#a19578", alt: "Tugboat moored in a harbour basin under a yellow evening haze", spec: "50 mm · f/8 · 1/250 s · ISO 100" },
  { id: "waterline-03", series: "waterline", w: 2400, h: 1350, tone: "#96a0a8", alt: "Three cargo ships on the horizon of a dark, calm sea", spec: "85 mm · f/8 · 1/500 s · ISO 100" },
  { id: "waterline-04", series: "waterline", w: 2000, h: 1325, tone: "#76797a", alt: "Stone jetty disappearing into fog", spec: "35 mm · f/4 · 1/60 s · ISO 400" },
  { id: "waterline-05", series: "waterline", w: 2400, h: 1600, tone: "#3a6769", alt: "Small red boat alone on turquoise water, seen from above", spec: "50 mm · f/5.6 · 1/500 s · ISO 200" },
  { id: "waterline-06", series: "waterline", w: 1920, h: 1280, tone: "#85898f", alt: "Gulls taking off above swans on grey harbour water", spec: "35 mm · f/4 · 1/1000 s · ISO 800" },
  { id: "waterline-07", series: "waterline", w: 1820, h: 2305, tone: "#566d7b", alt: "Dark swell with a small ship on the horizon", spec: "85 mm · f/5.6 · 1/500 s · ISO 400" },
  { id: "waterline-08", series: "waterline", w: 1800, h: 2400, tone: "#aaa7a7", alt: "Wooden stairs leading down into mist over water", spec: "28 mm · f/8 · 1/30 s · ISO 200" },
  { id: "waterline-09", series: "waterline", w: 1330, h: 1774, tone: "#707075", alt: "Bow of a sailing boat cutting through dark water, seen from the mast", spec: "24 mm · f/8 · 1/500 s · ISO 200" },

  { id: "structures-01", series: "structures", w: 2400, h: 1584, tone: "#4e4842", alt: "Canal between brick warehouses in morning haze, a small boat passing", spec: "35 mm · f/8 · 1/125 s · ISO 200" },
  { id: "structures-02", series: "structures", w: 2000, h: 2000, tone: "#cfcfd2", alt: "White apartment block façade with rows of balconies", spec: "85 mm · f/8 · 1/250 s · ISO 100" },
  { id: "structures-03", series: "structures", w: 2400, h: 1600, tone: "#8f969d", alt: "Cable-stayed bridge fading into fog above a riverbank", spec: "50 mm · f/5.6 · 1/125 s · ISO 200" },
  { id: "structures-04", series: "structures", w: 2400, h: 1600, tone: "#b9b9b9", alt: "Arched bridge over grey water in mist, a cyclist crossing", spec: "85 mm · f/8 · 1/250 s · ISO 200" },
  { id: "structures-05", series: "structures", w: 2048, h: 1365, tone: "#2a383b", alt: "Symmetrical view down escalators in a glass and steel station", spec: "24 mm · f/4 · 1/60 s · ISO 800" },
  { id: "structures-06", series: "structures", w: 1920, h: 2400, tone: "#7e7e7e", alt: "White angular monument against a black sky", spec: "35 mm · f/11 · 1/250 s · ISO 100" },
  { id: "structures-07", series: "structures", w: 1152, h: 1728, tone: "#3e3e3e", alt: "Steel lattice tower seen from directly below", spec: "24 mm · f/8 · 1/250 s · ISO 200" },
  { id: "structures-08", series: "structures", w: 1920, h: 2400, tone: "#b7bdc0", alt: "Stepped white concrete building rising into a pale sky", spec: "28 mm · f/8 · 1/500 s · ISO 100" },
  { id: "structures-09", series: "structures", w: 2400, h: 1714, tone: "#a09682", alt: "Yellow brick house front with a dark green door and window", spec: "50 mm · f/5.6 · 1/125 s · ISO 200" },

  { id: "after-hours-01", series: "after-hours", w: 1600, h: 2000, tone: "#403640", alt: "Office tower at night, a grid of lit windows", spec: "85 mm · f/4 · 1/30 s · ISO 1600" },
  { id: "after-hours-02", series: "after-hours", w: 2400, h: 1600, tone: "#888285", alt: "Underground train blurring past an empty platform", spec: "28 mm · f/8 · 1/4 s · ISO 200" },
  { id: "after-hours-03", series: "after-hours", w: 2400, h: 1600, tone: "#434343", alt: "Lone figure seen through the pillars of a dark station", spec: "50 mm · f/2.8 · 1/60 s · ISO 1600" },
  { id: "after-hours-04", series: "after-hours", w: 2048, h: 1536, tone: "#4f514b", alt: "Red tail lights through a rain-covered window at dusk", spec: "50 mm · f/2 · 1/60 s · ISO 800" },
  { id: "after-hours-05", series: "after-hours", w: 1600, h: 2400, tone: "#3f6688", alt: "Lighthouse lit against a deep blue evening sky", spec: "35 mm · f/4 · 2 s · ISO 400" },
  { id: "after-hours-06", series: "after-hours", w: 1600, h: 2400, tone: "#2d3940", alt: "Television tower framed between two dark high-rises", spec: "50 mm · f/5.6 · 1/60 s · ISO 800" },
  { id: "after-hours-07", series: "after-hours", w: 1920, h: 2400, tone: "#3b4244", alt: "Person walking a dog through a pool of light on a stone wall at night", spec: "35 mm · f/2 · 1/30 s · ISO 3200" },
  { id: "after-hours-08", series: "after-hours", w: 2400, h: 1498, tone: "#634c54", alt: "Street lamps glowing along a road in purple fog", spec: "50 mm · f/2.8 · 1/15 s · ISO 1600" },
  { id: "after-hours-09", series: "after-hours", w: 1693, h: 1129, tone: "#1c2125", alt: "Wave breaking over the edge of a sea pool at night", spec: "35 mm · f/4 · 1/8 s · ISO 3200" },

  { id: "figures-01", series: "figures", w: 2000, h: 1333, tone: "#6e7f8b", alt: "Person in a grey hooded coat facing the sea", spec: "50 mm · f/2.8 · 1/250 s · ISO 400" },
  { id: "figures-02", series: "figures", w: 2400, h: 1704, tone: "#b0a9a8", alt: "Person in a wool hat and ochre jacket, seen from behind in fog", spec: "50 mm · f/2 · 1/500 s · ISO 200" },
  { id: "figures-03", series: "figures", w: 1920, h: 2400, tone: "#acabab", alt: "Woman waiting on a platform as a train rushes past", spec: "35 mm · f/5.6 · 1/15 s · ISO 400" },
  { id: "figures-04", series: "figures", w: 2400, h: 1600, tone: "#40464a", alt: "Red umbrella from above on a rainy night street", spec: "35 mm · f/2 · 1/60 s · ISO 1600" },
  { id: "figures-05", series: "figures", w: 2400, h: 2018, tone: "#8f928a", alt: "Man in a suit crossing an empty road, seen from above", spec: "85 mm · f/5.6 · 1/500 s · ISO 200" },
  { id: "figures-06", series: "figures", w: 2000, h: 2000, tone: "#94acab", alt: "Woman by the sea with a strip of fabric blown across her eyes", spec: "50 mm · f/2.8 · 1/1000 s · ISO 200" },
  { id: "figures-07", series: "figures", w: 1600, h: 2400, tone: "#a1a8ab", alt: "Man standing on rocks, seen from behind, looking out to sea", spec: "35 mm · f/4 · 1/250 s · ISO 200" },
  { id: "figures-08", series: "figures", w: 2400, h: 1600, tone: "#535656", alt: "Silhouette of a person at the window wall of a large hall", spec: "28 mm · f/8 · 1/250 s · ISO 400" },
  { id: "figures-09", series: "figures", w: 2400, h: 1600, tone: "#f7c403", alt: "Small figure walking past a bright yellow wall", spec: "50 mm · f/8 · 1/500 s · ISO 100" },

  { id: "rooms-01", series: "rooms", w: 2400, h: 1600, tone: "#39180e", alt: "Vaulted brick arcade lit by low evening sun", spec: "24 mm · f/4 · 1/30 s · ISO 800" },
  { id: "rooms-02", series: "rooms", w: 2400, h: 1600, tone: "#434140", alt: "Man sitting alone in the pews of a bare stone hall", spec: "35 mm · f/2.8 · 1/60 s · ISO 1600" },
  { id: "rooms-03", series: "rooms", w: 1920, h: 2400, tone: "#908263", alt: "Empty tram aisle between worn seats", spec: "35 mm · f/2 · 1/60 s · ISO 800" },
  { id: "rooms-04", series: "rooms", w: 2400, h: 1600, tone: "#3a3c3b", alt: "Dark living room with a sofa beneath a bright window", spec: "35 mm · f/2.8 · 1/60 s · ISO 800" },
  { id: "rooms-05", series: "rooms", w: 1600, h: 2400, tone: "#939589", alt: "Café corner with a green leather bench, framed prints and a copper lamp", spec: "28 mm · f/4 · 1/60 s · ISO 400" },
  { id: "rooms-06", series: "rooms", w: 2000, h: 2000, tone: "#6b6b6b", alt: "Silhouettes of people at tables in front of tall café windows", spec: "35 mm · f/5.6 · 1/125 s · ISO 400" },
  { id: "rooms-07", series: "rooms", w: 1800, h: 2400, tone: "#e1dcd7", alt: "White wall with a narrow opening onto a staircase", spec: "50 mm · f/8 · 1/60 s · ISO 200" },
  { id: "rooms-08", series: "rooms", w: 2400, h: 1595, tone: "#655e5c", alt: "Steering wheel and dashboard of a vintage car", spec: "35 mm · f/2.8 · 1/125 s · ISO 400" },
  { id: "rooms-09", series: "rooms", w: 2400, h: 1600, tone: "#7e694e", alt: "Long moving walkway in a curved, tiled tunnel", spec: "24 mm · f/4 · 1/15 s · ISO 800" },

  { id: "outland-01", series: "outland", w: 2400, h: 1800, tone: "#6d8775", alt: "Storm clouds over a flat green marsh", spec: "28 mm · f/8 · 1/250 s · ISO 200" },
  { id: "outland-02", series: "outland", w: 2400, h: 1800, tone: "#c1bdaa", alt: "Football goal standing alone in a foggy field", spec: "50 mm · f/5.6 · 1/250 s · ISO 200" },
  { id: "outland-03", series: "outland", w: 1333, h: 2000, tone: "#929696", alt: "Country road between rows of trees in fog", spec: "50 mm · f/5.6 · 1/125 s · ISO 400" },
  { id: "outland-04", series: "outland", w: 1920, h: 2400, tone: "#beb8a6", alt: "White lifeguard chair in dune grass facing the sea", spec: "35 mm · f/8 · 1/250 s · ISO 100" },
  { id: "outland-05", series: "outland", w: 2400, h: 1800, tone: "#9a9895", alt: "Sandy cliff above a grey surf line", spec: "35 mm · f/8 · 1/500 s · ISO 200" },
  { id: "outland-06", series: "outland", w: 2400, h: 1600, tone: "#a19c9a", alt: "Walkers on a wide tidal beach under heavy cloud", spec: "85 mm · f/8 · 1/500 s · ISO 200" },
  { id: "outland-07", series: "outland", w: 2400, h: 1333, tone: "#8f8f8f", alt: "Line of dark conifers dissolving into fog", spec: "85 mm · f/5.6 · 1/250 s · ISO 400" },
  { id: "outland-08", series: "outland", w: 2400, h: 1800, tone: "#abaaab", alt: "Weathered bench under an anchor on a whitewashed wall", spec: "35 mm · f/8 · 1/250 s · ISO 100" },
  { id: "outland-09", series: "outland", w: 2400, h: 1600, tone: "#c5beaf", alt: "Dune grass bent by wind before a pale sea", spec: "50 mm · f/4 · 1/1000 s · ISO 100" }
];
