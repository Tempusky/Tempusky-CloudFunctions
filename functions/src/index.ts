import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();

export const writeLocationFromCoordinates = functions.firestore
  .document("environment_sensors_data/{documentId}")
  .onCreate(async (snapshot, context) => {
    const documentId = context.params.documentId;
    const data = snapshot.data();

    const geoPoint = data.sync_cords;

    const longitude = geoPoint.longitude;
    const latitude = geoPoint.latitude;

    // Check if longitude and latitude are valid
    if (longitude == null || latitude == null) {
      console.error("Longitude or Latitude is missing in the document");
      return null;
    }

    try {
      // Make an API call to get the location from the coordinates
      const response = await axios.get(
        "https://api.bigdatacloud.net/data/reverse-geocode-client",
        {
          params: {
            latitude,
            longitude,
          },
        }
      );

      const locationData = response.data;

      // Check if the response contains location data
      if (!locationData || !locationData.locality) {
        console.error("No location data found in the response");
        return null;
      }

      // Extract the location string
      let location = "unknown";
      if (locationData.city) {
        location = locationData.city;
      } else {
        location = locationData.locality;
      }


      const cordResponse = await axios.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        {
          params: {
            name: location,
          },
        }
      );

      const cordData = cordResponse.data;
      let locationLongitude = longitude;
      let locationLatitude = latitude;
      if (cordData.results.length > 0) {
        locationLongitude = cordData.results[0].longitude;
        locationLatitude = cordData.results[0].latitude;
      }

      const newGeoPoint = new admin.firestore.GeoPoint(
        locationLatitude, locationLongitude);

      // Write the location data to the document
      await snapshot.ref.set({location, location_cords: newGeoPoint},
        {merge: true});

      console.log(`Location data written for document ${documentId}`);
    } catch (error) {
      console.error("Error fetching location data", error);
    }

    return null;
  });
