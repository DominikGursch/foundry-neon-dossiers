import { DEFAULT_MAP, CITY_MAP, CITY_STREETS, COMMUNITY_MAP } from "./model.js";
import { atlasData, DEFAULT_ATLAS } from "./atlas.js";

export const MAP_PRESETS = [
  { image: CITY_MAP, label: "atlasDistricts", credit: "Night City Atlas · Saga MacKenzie / © 2025 R. Talsorian Games",
    url: "https://rtalsoriangames.com/wp-content/uploads/2025/01/Night-City-2045-Atlas-Maps-1.01.zip" },
  { image: CITY_STREETS, label: "atlasStreets", credit: "Night City Atlas · Saga MacKenzie / © 2025 R. Talsorian Games",
    url: "https://rtalsoriangames.com/wp-content/uploads/2025/01/Night-City-2045-Atlas-Maps-1.01.zip" },
  { image: COMMUNITY_MAP, label: "communityMap", credit: "Ced23Ric · Rodhlann · Writer's Cthulhu · J. Gray / R. Talsorian Games",
    url: "https://www.reddit.com/r/cyberpunkred/comments/z1744r/night_city_2045_map_cleaned_and_updated/" },
  { image: DEFAULT_MAP, label: "harborDemo", credit: "Harbor Grid · DominikGursch · CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/" }
];

const p = (x, y) => ({ x: x / 1200, y: y / 1855 });
const district = (id, name, threat, gangs, description, outline) => ({
  id, name, threat, gangs, description, polygon: outline.map(([x, y]) => p(x, y))
});

// Hand-positioned overview overlays; not surveyed boundaries. Threat levels are campaign defaults.
const districts = [
  district("little-europe", "Little Europe", "moderate", ["6th Street", "Eurotrashers", "Maelstrom", "Undertow"],
    "Old streets and new corporate developments share a crowded island district.", [[320,790],[360,752],[500,718],[520,733],[500,800],[500,870],[410,870],[410,800]]),
  district("upper-marina", "Upper Marina", "moderate", ["Maelstrom", "Prime-Time Players", "Street Queens"],
    "Waterfront city life, major venues and the Afterlife.", [[520,726],[614,734],[683,766],[716,824],[696,837],[634,850],[600,817],[610,780],[515,775]]),
  district("downtown", "Downtown", "low", ["Eastern Tigers Triad", "Skiv Family", "Undertow"],
    "A restored urban enclave on the western edge of the island.", [[320,800],[410,800],[410,872],[317,872],[290,843]]),
  district("hot-zone", "The Hot Zone", "extreme", ["Lightning Cats", "Maelstrom", "Reckoners"],
    "The scar at the heart of Night City. Plan access and hazards with the GM.", [[520,778],[603,780],[632,831],[682,857],[642,897],[590,918],[532,904],[500,873],[500,822]]),
  district("little-china", "Little China", "high", ["Gold Dragons", "Red Chrome Legion", "Weng Fang Tong"],
    "A community rebuilding between city development and the combat zones.", [[683,840],[738,862],[704,918],[662,936],[638,906]]),
  district("university", "University District", "moderate", ["Philharmonic Vampyres", "Princesses of Justice"],
    "Education, student housing and the Night City University campus.", [[310,875],[493,875],[500,924],[332,930],[309,916]]),
  district("the-glen", "The Glen", "moderate", ["DeadWoods", "Kill Krashers", "The Reckoners", "Weng Fang Tong"],
    "Banks, civic institutions and residential blocks south of the Hot Zone.", [[500,926],[590,929],[588,1028],[555,1057],[512,1055],[512,970]]),
  district("old-japantown", "Old Japantown", "high", ["Iron Sights", "Maelstrom", "Red Chrome Legion", "The Shroomers", "Tyger Claws"],
    "A former cultural center now divided among competing groups.", [[590,924],[663,932],[653,966],[624,989],[590,982]]),
  district("south-night-city", "South Night City", "high", ["Bozos", "DeadWoods", "The Enhanced", "Kanzaki Family", "Tyger Claws"],
    "Dense neighborhoods along the southwestern island waterfront.", [[330,932],[499,932],[514,1054],[408,1047],[365,1014]]),
  district("port", "Port of Night City", "moderate", ["Consortium", "DeadWoods"],
    "A seaport run by nomads of the Thelas Nation.", [[307,933],[330,933],[365,1017],[407,1049],[398,1090],[353,1108],[320,1051]]),
  district("reclamation", "Reclamation Zone", "high", ["Tombstone Preservers"],
    "Reclaimed waterfront and a district still finding its future.", [[409,1054],[555,1069],[536,1109],[404,1118],[355,1109],[398,1093]]),
  district("old-combat-zone", "Old Combat Zone", "extreme", ["Edgerunners Inc", "The Faded", "Generation Red", "Iron Sights", "The Shroomers"],
    "Contested blocks where safe passage should never be taken for granted.", [[590,984],[624,987],[653,970],[621,1028],[582,1059],[558,1066],[558,1020]]),
  district("norcal-base", "NorCal Military Base", "high", ["Culper Ring"],
    "A military-controlled zone north of the island.", [[258,517],[324,403],[427,350],[580,272],[600,321],[647,399],[581,452],[466,556],[368,547]]),
  district("watson", "Watson Development", "moderate", ["Arzin Tynon", "Dragula Racers", "G3", "Kanzaki Family", "Tyger Claws", "Wild Things"],
    "A growing northern district of dense housing and development.", [[373,550],[465,553],[584,454],[596,505],[585,631],[557,689],[477,671],[448,605]]),
  district("kabuki", "Kabuki", "moderate", ["G3", "Tyger Claws"],
    "A compact northern cultural center around the Nakagawa Kabuki Theater.", [[598,503],[635,533],[634,641],[587,685],[562,689],[588,631]]),
  district("new-westbrook", "New Westbrook", "moderate", ["Arzin Tynon", "Prime-Time Players", "Street Queens", "Tombstone Preservers"],
    "Northern sprawl mixing redevelopment with struggling neighborhoods.", [[649,406],[704,400],[755,470],[794,555],[829,594],[807,646],[815,784],[778,825],[673,717],[650,641],[636,530]]),
  district("charter-hill", "Charter Hill", "low", [],
    "A residential district on the eastern hills.", [[828,622],[900,633],[922,697],[817,700]]),
  district("exec-zone", "Exec Zone", "low", [],
    "A heavily secured district reserved for the city's elite.", [[819,703],[923,701],[930,773],[885,816],[811,786]]),
  district("heywood-docks", "Heywood Docks", "moderate", ["DeadWoods", "Skiv Family"],
    "Corporate shipping and logistics on the mainland shore.", [[764,861],[799,830],[870,920],[832,984],[772,951],[731,927]]),
  district("north-heywood", "North Heywood", "moderate", ["6th Street", "Inquisitors", "The Muses", "The Toecutters"],
    "Dense mainland housing between the docks and the southern neighborhoods.", [[875,924],[968,940],[1026,992],[984,1050],[879,1081],[833,986]]),
  district("heywood-industrial", "Heywood Industrial Zone", "moderate", ["Consortium", "DeadWoods", "The Enhanced", "Fixie's Couriers"],
    "Factories, workshops and improvised housing beside the Morro Canal.", [[730,931],[831,988],[878,1084],[742,1204],[637,1169],[678,1047]]),
  district("santo-domingo", "Santo Domingo", "high", ["El Norte Cartel", "Kill Krashers", "Rat Kings", "Steel Vaqueros"],
    "Southern Heywood, with nomad communities and contested local politics.", [[879,1089],[981,1055],[1005,1257],[894,1351],[743,1208]]),
  district("pacifica", "Pacifica Playground", "high", ["6th Street", "The Andersons", "The Enhanced", "Mudang Gumi", "Piranhas", "Voodoo Boys"],
    "Coastal neighborhoods and businesses at the southern edge of the city.", [[345,1215],[491,1180],[535,1212],[449,1310],[366,1345],[308,1300]]),
  district("rancho-coronado", "Rancho Coronado", "high", ["6th Street", "Albino Alligators", "Dirty Hippies", "Steel Vaqueros", "Voodoo Boys"],
    "An underserved southern district where residents make their own solutions.", [[540,1212],[633,1176],[741,1217],[892,1358],[835,1479],[743,1465],[670,1397],[575,1387],[457,1399],[372,1353],[454,1312]])
];

const nodes = [];
const edges = [];
function road(points) {
  for (const [id, x, y] of points) {
    if (!nodes.some(node => node.id === id)) nodes.push({ id, ...p(x, y) });
  }
  for (let i = 1; i < points.length; i++) edges.push({
    from: points[i - 1][0], to: points[i][0], modes: ["walk", "bike", "car"]
  });
}
road([["coronado-n",523,690],["bridge-n",518,715],["bridge-s",508,735],["marina-nw",553,739],
  ["stadium",596,739],["marina-bend",610,750],["afterlife",613,778],["marina-s",627,799],
  ["medical",668,824],["pelican",696,840],["bridge-east-w",737,865],["bridge-east-e",781,895]]);
road([["bridge-s",508,735],["morro-junction",503,797],["republic",463,797],["skyline-n",410,797],["downtown",327,797]]);
road([["skyline-n",410,797],["skyline-1",409,835],["skyline-2",409,873],["university",409,917],
  ["skyline-3",410,959],["skyline-4",409,996],["skyline-bend",420,1030],["port-access",449,1053],
  ["skyline-s",493,1064],["pacifica-n",537,1069],["skyline-se",582,1060],["combat-s",622,1028],
  ["combat-e",650,990],["japantown-e",670,960],["china-s",692,927],["china-e",713,898],["bridge-east-w",737,865]]);
road([["university",409,917],["lake-park",500,929],["glen-n",538,935],["glen-ne",566,934],
  ["japantown-w",590,941],["japantown",615,951],["combat-e",650,990]]);
road([["lake-park",500,929],["glen-w",500,971],["glen-sw",500,1017],["skyline-s",493,1064]]);
road([["glen-ne",566,934],["glen-e",566,977],["glen-se",566,1024],["skyline-se",582,1060]]);
road([["pacifica-n",537,1069],["pacifica-bridge",536,1124],["pacifica-s",529,1171],["pacifica",506,1200]]);

export const NIGHT_CITY_ATLAS = atlasData({
  image: CITY_MAP, width: 3600, height: 5564, kmAcross: 12, nodes, edges, districts
});

export function presetAtlas(image) {
  if ([CITY_MAP, CITY_STREETS].includes(image)) return { ...structuredClone(NIGHT_CITY_ATLAS), image };
  if (image === COMMUNITY_MAP) return structuredClone(COMMUNITY_ATLAS);
  if (image === DEFAULT_MAP) return structuredClone(DEFAULT_ATLAS);
  return null;
}

const location = (title, district, category, u, v, roadNode, description) => ({
  title, district, category, ...{ x: 0.24 + u / 1800 * 0.48, y: 0.38 + v / 1600 * 0.28 },
  roadNode, description, image: "", mapImage: CITY_MAP
});

// Positions follow labels on the official Full map, not entrance surveys. Prose is a new short summary.
export const CITY_EXAMPLES = [
  location("The Afterlife", "upper-marina", "commerce", 1035, 250, "afterlife",
    "Rogue's edgerunner bar in Upper Marina. A meeting point for crews, fixers and the next job. Atlas reference: B1, p. 3."),
  location("McCartney Field Stadium", "upper-marina", "community", 925, 148, "stadium",
    "A major venue for Night City's sports and concerts. Atlas reference: B9, p. 6."),
  location("City Medical Center", "upper-marina", "community", 1235, 370, "medical",
    "A medical institution in Upper Marina. Ask the GM about access, contacts and services in this campaign. Atlas reference: B3, p. 3."),
  location("Club Atlantis", "the-glen", "commerce", 890, 740, "glen-n",
    "A multi-level club in The Glen, known for its striking atmosphere. Atlas reference: G6, p. 8."),
  location("Totentanz", "hot-zone", "mystery", 820, 240, "marina-nw",
    "A chrome-metal club associated with Maelstrom. Off-road access and local hazards require GM judgment. Atlas reference: D4, p. 6."),
  location("Forlorn Hope", "little-china", "commerce", 1378, 657, "china-s",
    "The earlier Little China home of the edgerunner bar, before Tales of the RED: Hope Reborn. Adjust its status to your campaign timeline. Atlas reference: E3, p. 7."),
  location("Crisis Medical Center", "old-japantown", "community", 1047, 613, "japantown-w",
    "A medical facility in Old Japantown. A possible contact for crews operating in the combat zones. Atlas reference: H1, p. 8."),
  location("Dock 13", "port", "commerce", 220, 1105, "port-access",
    "Willy Maze's storefront and occasional night-market venue at the Port of Night City. Atlas reference: J1, p. 9.")
];

export const ATLAS_SOURCE = "https://rtalsoriangames.com/wp-content/uploads/2025/01/RTG-CPR-DLC-NightCityAtlasv1.01.pdf";

// Existing anchors use the full 3615px source; the marker-free map omits both sidebars.
const cp = (x, y) => ({ x: (x / 1600 * 3615 - 549) / 2519, y: y / 1066 });
const communityDistrict = (id, outline) => ({
  ...districts.find(district => district.id === id),
  ...(id === "hot-zone" ? {
    name: "City Center",
    description: "This marker-free map variant depicts an intact City Center instead of the Hot Zone. Adapt its status to your campaign timeline."
  } : {}),
  polygon: outline.map(([x, y]) => cp(x, y))
});
const communityNodes = [], communityEdges = [];
function communityRoad(points) {
  for (const [id, x, y] of points) {
    if (!communityNodes.some(node => node.id === id)) communityNodes.push({ id, ...cp(x, y) });
  }
  for (let i = 1; i < points.length; i++) communityEdges.push({
    from: points[i - 1][0], to: points[i][0], modes: ["walk", "bike", "car"]
  });
}
communityRoad([["north-bridge",742,275],["island-n",738,329],["ring-nw",645,350],["ring-west-1",553,376],
  ["ring-west-2",524,402],["ring-west-3",551,452],["university-west",556,500],["university-south",547,560],
  ["south-west",553,604],["south-west-2",571,699],["ring-sw",604,760],["ring-s",640,784],
  ["south-bridge-n",779,790],["ring-se",862,775],["combat-s",920,700],["combat-e",955,630],
  ["china-s",1000,566],["china-e",1045,515],["island-e",1075,490],["east-bridge",1125,460]]);
communityRoad([["island-n",738,329],["marina-nw",870,350],["stadium",920,351],["afterlife",978,397],
  ["medical",1014,435],["marina-se",1050,458],["island-e",1075,490]]);
communityRoad([["university-south",547,560],["university-east",697,554],["glen-nw",732,578],
  ["glen-n",810,578],["japantown",900,578],["china-road",970,580],["china-s",1000,566]]);
communityRoad([["glen-n",810,578],["glen-center",804,649],["glen-s",801,744],["south-bridge-n",779,790],
  ["south-bridge",782,849],["heywood-bridge",783,899]]);

export const COMMUNITY_ATLAS = atlasData({
  image: COMMUNITY_MAP, width: 2519, height: 2408, kmAcross: 18 * 2519 / 3615,
  nodes: communityNodes, edges: communityEdges,
  districts: [
    communityDistrict("norcal-base", [[600,0],[851,0],[851,90],[708,107],[665,65]]),
    communityDistrict("watson", [[665,67],[851,93],[873,178],[834,280],[703,243]]),
    communityDistrict("new-westbrook", [[853,0],[1082,0],[1073,166],[1189,299],[1170,473],[1088,466],[992,341],[873,176]]),
    communityDistrict("exec-zone", [[1168,317],[1207,302],[1233,369],[1208,397],[1156,385]]),
    communityDistrict("little-europe", [[513,381],[635,346],[727,365],[695,489],[550,509],[513,458]]),
    communityDistrict("upper-marina", [[737,332],[932,325],[996,379],[1049,452],[965,483],[917,424],[856,389],[738,366]]),
    communityDistrict("hot-zone", [[737,368],[851,390],[916,427],[954,493],[919,553],[819,578],[724,548],[699,480]]),
    communityDistrict("university", [[517,507],[697,494],[722,550],[697,579],[531,571],[501,553]]),
    communityDistrict("south-night-city", [[529,573],[689,580],[724,734],[715,790],[612,792],[548,751],[522,634]]),
    communityDistrict("the-glen", [[697,581],[819,580],[839,732],[811,758],[747,752],[723,734]]),
    communityDistrict("old-japantown", [[837,553],[921,548],[973,580],[946,637],[844,636]]),
    communityDistrict("little-china", [[962,486],[1037,475],[1082,505],[1007,584],[955,579],[922,549]]),
    communityDistrict("old-combat-zone", [[846,639],[945,640],[920,699],[864,774],[813,789],[839,731]]),
    communityDistrict("heywood-industrial", [[1112,614],[1219,569],[1280,759],[1219,907],[1054,883],[934,868],[1032,758]]),
    communityDistrict("north-heywood", [[933,870],[1054,886],[1219,910],[1294,1034],[1095,1064],[769,1064],[781,909]]),
    communityDistrict("pacifica", [[522,939],[643,900],[760,899],[770,989],[668,1065],[526,1065]]),
    communityDistrict("rancho-coronado", [[773,990],[932,945],[1033,995],[1094,1064],[672,1065]])
  ]
});

const communityAnchors = [
  [904,407,"afterlife"], [894,370,"stadium"], [938,468,"medical"], [807,578,"glen-n"],
  [793,393,"marina-nw"], [1037,532,"china-e"], [859,547,"japantown"]
];
export const COMMUNITY_EXAMPLES = CITY_EXAMPLES.slice(0, 7).map((place, index) => {
  const [x, y, roadNode] = communityAnchors[index];
  return { ...place, ...cp(x, y), roadNode, mapImage: COMMUNITY_MAP };
});

export function starterPlaces(image) {
  if ([CITY_MAP, CITY_STREETS].includes(image)) return CITY_EXAMPLES;
  if (image === COMMUNITY_MAP) return COMMUNITY_EXAMPLES;
  return [];
}
