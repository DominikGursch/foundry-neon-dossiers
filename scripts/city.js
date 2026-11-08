import { COMMUNITY_MAP } from "./model.js";
import { atlasData } from "./atlas.js";
import { COMMUNITY_ROADS, communityPoint } from "./community-roads.js";

export const MAP_PRESETS = [
  { image: COMMUNITY_MAP, label: "communityMap", credit: "Ced23Ric · Rodhlann · Writer's Cthulhu · J. Gray / R. Talsorian Games",
    url: "https://www.reddit.com/r/cyberpunkred/comments/z1744r/night_city_2045_map_cleaned_and_updated/" }
];
export const ATLAS_SOURCE = "https://rtalsoriangames.com/wp-content/uploads/2025/01/RTG-CPR-DLC-NightCityAtlasv1.01.pdf";

// Campaign overlays for this specific Community image, not surveyed boundaries.
const district = (id, name, threat, gangs, description, outline) => ({
  id, name, threat, gangs, description, polygon: outline.map(([x, y]) => communityPoint(x, y))
});
export const COMMUNITY_ATLAS = atlasData({
  image: COMMUNITY_MAP, width: 2519, height: 2408, kmAcross: 18 * 2519 / 3615,
  ...COMMUNITY_ROADS,
  districts: [
    district("norcal-base", "NorCal Military Base", "high", ["Culper Ring"],
      "A military-controlled zone north of the island.", [[600,0],[851,0],[851,90],[708,107],[665,65]]),
    district("watson", "Watson Development", "moderate", ["Arzin Tynon", "Dragula Racers", "G3", "Kanzaki Family", "Tyger Claws", "Wild Things"],
      "A growing northern district of dense housing and development.", [[665,67],[851,93],[873,178],[834,280],[703,243]]),
    district("new-westbrook", "New Westbrook", "moderate", ["Arzin Tynon", "Prime-Time Players", "Street Queens", "Tombstone Preservers"],
      "Northern sprawl mixing redevelopment with struggling neighborhoods.", [[853,0],[1082,0],[1073,166],[1189,299],[1170,473],[1088,466],[992,341],[873,176]]),
    district("exec-zone", "Exec Zone", "low", [],
      "A heavily secured district reserved for the city's elite.", [[1168,317],[1207,302],[1233,369],[1208,397],[1156,385]]),
    district("little-europe", "Little Europe", "moderate", ["6th Street", "Eurotrashers", "Maelstrom", "Undertow"],
      "Old streets and new corporate developments share a crowded island district.", [[513,381],[635,346],[727,365],[695,489],[550,509],[513,458]]),
    district("upper-marina", "Upper Marina", "moderate", ["Maelstrom", "Prime-Time Players", "Street Queens"],
      "Waterfront city life, major venues and the Afterlife.", [[737,332],[932,325],[996,379],[1049,452],[965,483],[917,424],[856,389],[738,366]]),
    district("hot-zone", "City Center", "extreme", ["Lightning Cats", "Maelstrom", "Reckoners"],
      "Corporate towers and busy streets at the heart of Night City.", [[737,368],[851,390],[916,427],[954,493],[919,553],[819,578],[724,548],[699,480]]),
    district("university", "University District", "moderate", ["Philharmonic Vampyres", "Princesses of Justice"],
      "Education, student housing and the Night City University campus.", [[517,507],[697,494],[722,550],[697,579],[531,571],[501,553]]),
    district("south-night-city", "South Night City", "high", ["Bozos", "DeadWoods", "The Enhanced", "Kanzaki Family", "Tyger Claws"],
      "Dense neighborhoods along the southwestern island waterfront.", [[529,573],[689,580],[724,734],[715,790],[612,792],[548,751],[522,634]]),
    district("the-glen", "The Glen", "moderate", ["DeadWoods", "Kill Krashers", "The Reckoners", "Weng Fang Tong"],
      "Banks, civic institutions and residential blocks south of the city center.", [[697,581],[819,580],[839,732],[811,758],[747,752],[723,734]]),
    district("old-japantown", "Old Japantown", "high", ["Iron Sights", "Maelstrom", "Red Chrome Legion", "The Shroomers", "Tyger Claws"],
      "A former cultural center now divided among competing groups.", [[837,553],[921,548],[973,580],[946,637],[844,636]]),
    district("little-china", "Little China", "high", ["Gold Dragons", "Red Chrome Legion", "Weng Fang Tong"],
      "A community rebuilding between city development and the combat zones.", [[962,486],[1037,475],[1082,505],[1007,584],[955,579],[922,549]]),
    district("old-combat-zone", "Old Combat Zone", "extreme", ["Edgerunners Inc", "The Faded", "Generation Red", "Iron Sights", "The Shroomers"],
      "Contested blocks where safe passage should never be taken for granted.", [[846,639],[945,640],[920,699],[864,774],[813,789],[839,731]]),
    district("heywood-industrial", "Heywood Industrial Zone", "moderate", ["Consortium", "DeadWoods", "The Enhanced", "Fixie's Couriers"],
      "Factories, workshops and improvised housing beside the Morro Canal.", [[1112,614],[1219,569],[1280,759],[1219,907],[1054,883],[934,868],[1032,758]]),
    district("north-heywood", "North Heywood", "moderate", ["6th Street", "Inquisitors", "The Muses", "The Toecutters"],
      "Dense mainland housing between the docks and the southern neighborhoods.", [[933,870],[1054,886],[1219,910],[1294,1034],[1095,1064],[769,1064],[781,909]]),
    district("pacifica", "Pacifica Playground", "high", ["6th Street", "The Andersons", "The Enhanced", "Mudang Gumi", "Piranhas", "Voodoo Boys"],
      "Coastal neighborhoods and businesses at the southern edge of the city.", [[522,939],[643,900],[760,899],[770,989],[668,1065],[526,1065]]),
    district("rancho-coronado", "Rancho Coronado", "high", ["6th Street", "Albino Alligators", "Dirty Hippies", "Steel Vaqueros", "Voodoo Boys"],
      "An underserved southern district where residents make their own solutions.", [[773,990],[932,945],[1033,995],[1094,1064],[672,1065]])
  ]
});

export function presetAtlas(image) {
  return image === COMMUNITY_MAP ? structuredClone(COMMUNITY_ATLAS) : null;
}

const example = (title, district, category, x, y, roadNode, description) => ({
  title, district, category, ...communityPoint(x, y), roadNode, description, image: "", mapImage: COMMUNITY_MAP
});
export const COMMUNITY_EXAMPLES = [
  example("The Afterlife", "upper-marina", "commerce", 904,407,"afterlife",
    "Rogue's edgerunner bar in Upper Marina. A meeting point for crews, fixers and the next job. Atlas reference: B1, p. 3."),
  example("McCartney Field Stadium", "upper-marina", "community", 894,370,"stadium",
    "A major venue for Night City's sports and concerts. Atlas reference: B9, p. 6."),
  example("City Medical Center", "upper-marina", "community", 938,468,"medical",
    "A medical institution in Upper Marina. Atlas reference: B3, p. 3."),
  example("Club Atlantis", "the-glen", "commerce", 807,578,"glen-n",
    "A multi-level club in The Glen, known for its striking atmosphere. Atlas reference: G6, p. 8."),
  example("Totentanz", "hot-zone", "mystery", 793,393,"marina-nw",
    "A chrome-metal club associated with Maelstrom. Watch your back. Atlas reference: D4, p. 6."),
  example("Forlorn Hope", "little-china", "commerce", 1037,532,"china-e",
    "An edgerunner bar in Little China. Atlas reference: E3, p. 7."),
  example("Crisis Medical Center", "old-japantown", "community", 859,547,"japantown",
    "A medical facility in Old Japantown. A possible contact for crews operating in the combat zones. Atlas reference: H1, p. 8.")
];

export function starterPlaces(image) {
  return image === COMMUNITY_MAP ? COMMUNITY_EXAMPLES : [];
}
