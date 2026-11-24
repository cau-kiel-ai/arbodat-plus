// A coordinate value entered: not empty and a number (0 too, it isn't "no value")
function isCoordinateValue(value) {
    return value != null && String(value).trim() !== '' && !isNaN(value);
}

async function transformCoordinatesToWGS84(longitude, latitude, sourceEPSG) {

    const sourceProj = 'EPSG:'+sourceEPSG;
    const targetProj = 'EPSG:4326'; // WGS 84

    if (!proj4.defs(sourceProj)) {
        // GET proj4.defs
        try {
            const response = await fetch(`https://epsg.io/${sourceEPSG}.proj4`);
            if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);
            const projString = await response.text();
            proj4.defs(sourceProj, projString);
        } catch (error) {
            console.error('Error fetching EPSG projection: ', error);
            return { transformedLongitude: null, transformedLatitude: null };
        }
    }
  
    const result = proj4(sourceProj, targetProj, [longitude, latitude]);

    return {
        transformedLongitude: result[0].toFixed(7),
        transformedLatitude:  result[1].toFixed(7)
    };
}
