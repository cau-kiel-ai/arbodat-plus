
// ~~~~~~~~~~ global settings ~~~~~~~~~~~~~~~~~~~
let mapZoom    = 12;
let mapMaxZoom = 18;

// Default: CAU University
const default_longitude = 10.1225036;
const default_latitude  = 54.3388074;

// catch Gauß-Krüger-Koordinatensyste -> hide map
const gkEPSG = [31462, 31463, 31468, 31465]  

const mapStore = {
  maps: {},
  markers: {}
};
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// initialise map, if not yet existing

function initMap(map_id) {
    if(!mapStore.maps[map_id]) {
        const new_map = L.map(map_id).setView([default_latitude, default_longitude], mapZoom);
        const new_marker = L.marker([default_latitude, default_longitude]).addTo(new_map);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: mapMaxZoom,
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(new_map);

        mapStore.maps[map_id] = new_map;
        mapStore.markers[map_id] = new_marker;
    }
}

// update map with new coordinates
function updateMap(map_id, lat, lon) {
    const map = mapStore.maps[map_id];
    const marker = mapStore.markers[map_id];
    if (map && marker) {
        map.setView([lat, lon], mapZoom);
        marker.setLatLng([lat, lon]);
    }
}

// Modularised, extended functionality for opening Accordeon and calling invalidateSize()
function setupAccordionMap(accordionId, mapId) {
  // toggel this Event, when Accordion-Panel fully open
  document.getElementById(accordionId).addEventListener("shown.bs.collapse", function () {
    // init map if not done yet
    initMap(mapId);
    
    // small time add on, to make sure accordion is fully shown
    setTimeout(() => {
      const map = mapStore.maps[mapId];
      if (map) {
        map.invalidateSize(); // correcting the fit / size of map
      } else {
        console.error("Map could not be found:", mapId);
      }
    }, 200); // Delay, to stabalize Layout
  });
}

// call Funktion when loading the page, to prepare Accordion-Setup
document.addEventListener("DOMContentLoaded", function () {
  // call function for Akkordeons in sample, site
  setupAccordionMap("siteCoords_AccordionCollapseElem", "site_map");
  //setupAccordionMap("sampleCoords_AccordionItem", "sample_map");
});
