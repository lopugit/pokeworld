const EARTH_RADIUS_METRES = 6_378_137;
const MIN_LATITUDE = -87;
const MAX_LATITUDE = 87;
const ZOOM = 20;
const WIDTH = 512;
const SCALE = 2;

const degreesPerMeterAtEquator = 360 / (2 * Math.PI * EARTH_RADIUS_METRES);
const metresAtEquatorPerTilePixel = 156_543.03392 / 2 ** ZOOM;
const xIncrement = degreesPerMeterAtEquator * metresAtEquatorPerTilePixel * (WIDTH / SCALE);
const yIndexScale = 180 / (Math.PI * xIncrement);
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const projectLatitude = (latitude: number) =>
  Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2));
const minLatitudeProjected = projectLatitude(MIN_LATITUDE);

export function blockForCoordinates(latitudeRaw: unknown, longitudeRaw: unknown) {
  const latitudeNumber = Number(latitudeRaw);
  const longitudeNumber = Number(longitudeRaw);
  if (!Number.isFinite(latitudeNumber) || !Number.isFinite(longitudeNumber)) {
    throw new Error("Latitude and longitude must be numbers");
  }
  const latitude = Math.min(Math.max(latitudeNumber, MIN_LATITUDE), MAX_LATITUDE);
  const longitude = Math.min(Math.max(longitudeNumber, -180), 180 - Number.EPSILON);
  return {
    x: Math.max(0, Math.floor((longitude + 180) / xIncrement)),
    y: Math.max(0, Math.floor((projectLatitude(latitude) - minLatitudeProjected) * yIndexScale)),
  };
}
