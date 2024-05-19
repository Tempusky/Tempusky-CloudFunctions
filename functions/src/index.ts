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

export const notifyUsersToSyncData = functions.firestore
  .document("requests/{documentId}")
  .onCreate(async (snapshot, context) => {
    const documentId = context.params.documentId;
    const data = snapshot.data();

    const locationToRequestDataFrom = data.location;

    const dataFromRequestedLocation = await admin
      .firestore()
      .collection("environment_sensors_data")
      .where("location", "==", locationToRequestDataFrom)
      .get();

    const userIds = new Set();
    dataFromRequestedLocation.forEach((doc) => {
      const data = doc.data();
      userIds.add(data.uid);
    });

    const userTokenDocuments = await admin
      .firestore()
      .collection("user_tokens")
      .get();

    userTokenDocuments.forEach(async (doc) => {
      const docId = doc.id; // This is the user ID
      const data = doc.data();
      const token = data.token;

      if (userIds.has(docId)) {
        try {
          // Send a notification to the user to sync data
          const message = {
            notification: {
              title: `New data request for ${locationToRequestDataFrom}`,
              body: "A user is requesting data from your location",
            },
            token,
          };

          await admin.messaging().send(message);

          console.log(
            `Notification sent to user ${docId} for document ${documentId}`
          );
        } catch (error) {
          console.error("Error sending notification", error);
        }
      }
    });
    await snapshot.ref.delete();
    return null;
  });
