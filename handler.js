'use strict';

const linebot = require('linebot');
const axios = require('axios');
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const googleKey = process.env.GOOGLE_API_KEY;
const fs = require('fs');
const raw = fs.readFileSync('geodata.json');
const theaters = JSON.parse(raw);
const bot = linebot({
  channelId: process.env.CHANNEL_ID,
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

AWS.config.update({
  region: 'ap-northeast-1'
});

const tmdbAxios = axios.create({
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json'
  }
});

module.exports.main = async (event) => {
  if (bot.verify(event.body, event.headers["x-line-signature"])) {
    var body = JSON.parse(event.body)["events"][0];
    var replyToken = body.replyToken;
    var userId = body.source.userId;
    var messages = [];
    switch (body.type) {
      case "follow":
        await deleteUser(userId);
        await createUser(userId);
        var welcomeMsg = welcomeMessage();
        var addressMsg = setAddressMessage();
        messages.push(welcomeMsg, addressMsg);
        await replyMessage(replyToken, messages);
        break;
      case "message":
        var res = await getUser(userId);
        var user = JSON.parse(res);
        var messages = await setReply(user, body);
        if (messages.length > 0) {
          await replyMessage(replyToken, messages);
        }
        break;
      case "unfollow":
        break;
      case "postback":
        if (body.postback.data === "datePick") {
          var res = await getUser(userId);
          var user = JSON.parse(res);
          var messages = await setReply(user, body);
          if (messages.length > 0) {
            await replyMessage(replyToken, messages);
          }
        }
        break;
    }
  }

  async function setReply(user, eventBody) {
    var messages = [];
    switch (user.situation) {
      case "address":
        var messageType = eventBody.message.type;
        if (messageType != "text" && messageType != "location") {
          return messages;
        }

        var keyParams = {
          "user_id": user.user_id,
        };

        var expAtr = {
          ":sit": "address",
          ":lng": "",
          ":lat": "",
          ":plc": "",
          ":sct": "",
          ":dir": 0,
          ":rel": 0,
        };
        await updateUser(keyParams, expAtr);

        var location = new Object();
        var searchStatus;
        var destination;
        if (messageType == "text") {
          destination = eventBody.message.text.replace(/\r?\n/g, " ");
          location = await getLocation(destination);
          if (typeof (location) == "object") {
            searchStatus = "OK";
          } else {
            searchStatus = location;
          }
        } else if (messageType == "location") {
          searchStatus = "LINE_LOCATION";
          location.lat = eventBody.message.latitude;
          location.lng = eventBody.message.longitude;
          destination = eventBody.message.address;
        }

        if (searchStatus == "OK" || searchStatus == "LINE_LOCATION") {
          var keyParams = {
            "user_id": user.user_id,
          };
          var expAtr = {
            ":sit": "time",
            ":lng": location.lng,
            ":lat": location.lat,
            ":plc": destination,
            ":sct": "",
            ":dir": 0,
            ":rel": 0
          };
          await updateUser(keyParams, expAtr);
          var setTimeMsg = setTimeMessage();
          messages.push(setTimeMsg);
        } else if (searchStatus == "ZERO_RESULTS") {
          var resetAddMsg = resetAddressMessage();
          messages.push(resetAddMsg);
        } else {
          var errorMsg = googleErrorMessage("geocoding API", searchStatus);
          messages.push(errorMsg);
        }
        break;
      case "time":
      case "searched":
        if (eventBody.message) {
          var resetTimeMsg = resetTimeMessage();
          messages.push(resetTimeMsg);
          return messages;
        } else if (eventBody.type == "postback") {
          var keyParams = {
            "user_id": user.user_id,
          };
          var expAtr = {
            ":sit": "searched",
            ":sct": eventBody.postback.params.time,
            ":lng": user.lng,
            ":lat": user.lat,
            ":plc": user.place,
            ":dir": 0,
            ":rel": 0
          };
          await updateUser(keyParams, expAtr);
        }

        var nearByTheaters = searchTheaters(user.lat, user.lng);
        var theatersInfo = [];
        if (nearByTheaters.length > 0) {
          for (let i = 0; i < nearByTheaters.length; i++) {
            var params = {
              TableName: "Cinemas",
              Key: {
                "name": nearByTheaters[i]
              }
            };
            var res = await docClient.get(params).promise();
            theatersInfo.push(JSON.stringify(res.Item));
          }

          var keyParams = {
            "user_id": user.user_id,
          };

          var expAtr = {
            ":sit": "searched",
            ":sct": eventBody.postback.params.time,
            ":lng": user.lng,
            ":lat": user.lat,
            ":plc": user.place,
            ":dir": 0,
            ":rel": theatersInfo.length
          };
          await updateUser(keyParams, expAtr);

          var moviesInfo = processingInfo(theatersInfo, eventBody.postback.params.time);

          if(moviesInfo.length > 0){
            var finishMsg = searchFinishMessage(user.place, eventBody.postback.params.time, nearByTheaters.length);
            var placesMsg = await theatersMessage(moviesInfo);
            messages.push(finishMsg, placesMsg);
          } else {
            var noTheaterMsg = noTheaterMessage();
            messages.push(noTheaterMsg);
          }

        } else {
          var keyParams = {
            "user_id": user.user_id,
          };

          var expAtr = {
            ":sit": "address",
            ":lng": "",
            ":lat": "",
            ":plc": "",
            ":sct": "",
            ":dir": 0,
            ":rel": 0,
          };
          await updateUser(keyParams, expAtr);
          var noTheaterMsg = noTheaterMessage();
          var addressMsg = setAddressMessage();
          messages.push(noTheaterMsg, addressMsg);
        }
        break;
    }
    return messages;
  }
};

async function getLocation(address) {
  var geocodeApiUrl = "https://maps.googleapis.com/maps/api/geocode/json";
  var location = new Object();
  var params = {
    address: address,
    components: {
      country: "ja"
    },
    key: googleKey,
  };
  location = await axios.get(geocodeApiUrl, {
      params: params
    })
    .then((res) => {
      location.lat = res.data.results[0].geometry.location.lat;
      location.lng = res.data.results[0].geometry.location.lng;
      return location;
    })
    .catch((err) => {
      console.log(err);
      return "ZERO_RESULTS";
    });
  return location;
}

function searchTheaters(lat,lng) {
  const theaterLists = [];
  const R = Math.PI / 180;
  theaters.features.forEach(theater => {
    var theaterLng = theater.geometry.coordinates[0];
    var theaterLat = theater.geometry.coordinates[1];
    // inside 20km;
    if (distance(lat, lng, theaterLat, theaterLng, R) < 20) {
      theaterLists.push(theater.properties.title);
    }
  });
  return theaterLists;
}

function distance(userLat, userLng, theaterLat, theaterLng, radius) {
  userLat *= radius;
  userLng *= radius;
  theaterLat *= radius;
  theaterLng *= radius;
  return 6371 * Math.acos(Math.cos(userLat) * Math.cos(theaterLat) * Math.cos(theaterLng - userLng) + Math.sin(userLat) * Math.sin(theaterLat));
}

// -> fix
// async function getTheaterInfo(theaters) {
//   const screenInfo = [];
//   for (let i = 0; i < theaters.length; i++){
//     var params = {
//       TableName: "Cinemas",
//       Key: {
//         "name": theaters[i]
//       }
//     }
//     var res = await docClient.get(params).promise();
//     screenInfo.push(JSON.stringify(res.Item));
//   }
//   return screenInfo;
// }

function welcomeMessage() {
  var msg = {
    "type": "text",
    "text": "友だち登録ありがとうございます"
  };
  return msg;
}

function setAddressMessage() {
  var msg = {
    "type": "text",
    "text": "それでは、目的の場所の「住所」を教えてね！"
  };
  return msg;
}

function resetAddressMessage() {
  var msg = {
    "type": "text",
    "text": "ごめんなさい！目的地の再入力をお願いします。"
  };
  return msg;
}

function setTimeMessage() {
  var msg = {
    "type": "text",
    "text": "何時くらいに観に行きますか？下のボタンから選んでね。",
    "quickReply": {
      "items": [{
        "type": "action",
        "action": {
          "type": "datetimepicker",
          "label": "Select date",
          "data": "datePick",
          "mode": "time"
        }
      }]
    }
  };
  return msg;
}

function resetTimeMessage() {
  var msg = {
    "type": "text",
    "text": "ごめんなさい!時間は下のボタンから選んでね。",
    "quickReply": {
      "items": [{
        "type": "action",
        "action": {
          "type": "datetimepicker",
          "label": "Select date",
          "data": "datePick",
          "mode": "time"
        }
      }]
    }
  };
  return msg;
}


function noTheaterMessage() {
  var msg = {
    "type": "text",
    "text": "ごめんなさい！目的の時間と場所からは映画館が見つかりません。場所と時間を変えてみてね。"
  };
  return msg;
}

function searchFinishMessage(place, time, searchResults) {
  var msg = {
    "type": "text",
    "text": "お待たせしました！今から行ける映画情報はこちらです。" + "\n\n" +
      "検索場所：" + place + "\n" +
      "目的の時間：" + time + "\n\n" +
      "【検索結果】" + searchResults + "件\n\n"
    // "検索するジャンルを変更したい場合は、新しいジャンルをつぶやいてくださいね" + EMOJI_OK
  };
  return msg;
}

async function theatersMessage(moviesInfo) {
  const bubbleList = new Array();
  //　fix -> moviesInfoから取得数
  for (var i = 0; i < moviesInfo.slice(0, 8).length; i++) {
    var movieImage;
    const image_path = await tmdbAxios.get(encodeURI(`https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&language=ja&query=${moviesInfo[i].mvTitle}&page=1&include_adult=false`))
      .then((res) => {
        return res.data.results[0].poster_path;
      })
      .catch((err) => {
        return "ZERO_RESULTS";
      });
    if (image_path !== "ZERO_RESULTS") {
      movieImage = `https://image.tmdb.org/t/p/w500/${image_path}`;
    } else {
      movieImage = `https://picsum.photos/200/300`;
    }

    var bubbleMsg = {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [{
            "type": "image",
            "url": movieImage,
            "size": "full",
            "aspectMode": "cover",
            "aspectRatio": "2:3",
            "gravity": "top"
          },
          {
            "type": "box",
            "layout": "vertical",
            "contents": [{
                "type": "box",
                "layout": "vertical",
                "contents": [{
                  "type": "text",
                  "text": moviesInfo[i].mvTitle,
                  "size": "xxl",
                  "color": "#ffffff",
                  "weight": "bold",
                  "wrap": true
                }]
              },
              {
                "type": "box",
                "layout": "baseline",
                "contents": [{
                  "type": "text",
                  "text": moviesInfo[i].mvTheater,
                  "color": "#ffffff",
                  "size": "lg",
                  "flex": 0,
                  "wrap": true
                }],
                "spacing": "lg",
                "margin": "xl"
              },
              {
                "type": "box",
                "layout": "vertical",
                "contents": [{
                    "type": "filler"
                  },
                  {
                    "type": "box",
                    "layout": "baseline",
                    "contents": [{
                        "type": "filler"
                      },
                      {
                        "type": "text",
                        "text": `${moviesInfo[i].mvTime} 上映開始`,
                        "color": "#ffffff",
                        "flex": 0,
                        "offsetTop": "-2px",
                        "size": "lg",
                        "weight": "bold",
                      },
                      {
                        "type": "filler"
                      }
                    ],
                    "spacing": "sm"
                  },
                  {
                    "type": "filler"
                  }
                ],
                "borderWidth": "1px",
                "cornerRadius": "4px",
                "spacing": "sm",
                "borderColor": "#ffffff",
                "margin": "xxl",
                "height": "40px"
              }
            ],
            "position": "absolute",
            "offsetBottom": "0px",
            "offsetStart": "0px",
            "offsetEnd": "0px",
            "backgroundColor": "#00000Acc",
            "paddingAll": "20px",
            "paddingTop": "18px"
          },
          {
            "type": "box",
            "layout": "vertical",
            "contents": [{
              "type": "text",
              "text": "New",
              "color": "#ffffff",
              "align": "center",
              "size": "xs",
              "offsetTop": "3px"
            }],
            "position": "absolute",
            "cornerRadius": "20px",
            "offsetTop": "18px",
            "backgroundColor": "#ff334b",
            "offsetStart": "18px",
            "height": "25px",
            "width": "53px"
          }
        ],
        "paddingAll": "0px"
      }
    };
    bubbleList.push(bubbleMsg);
  }

  var flexMsg = {
    "type": "flex",
    "altText": "近くの映画上映情報",
    "contents": {
      "type": "carousel",
      "contents": bubbleList
    }
  };
  return flexMsg;
}

// async function getTmdbImage(){
//   const image_path = await tmdbAxios.get(`https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&language=ja&query=${query}&page=1&include_adult=false`)
//     .then((res) =>
//       { return res.data.results.poster_path }
//     )
//     .catch((err) =>
//       {
//         console.log(err);
//         return "ZERO_RESULTS";
//       }
//     );
//     return image_path;
// }

function processingInfo(theatersInfo, time) {
  const moviesInfo = new Array();
  var movieInfo;
  for (var i = 0; i < theatersInfo.length; i++) {
    var theater = JSON.parse(theatersInfo[i]);
    for (var n = 0; n < theater.cnm_info[0].length; n++) {
      const targetMovie = theater.cnm_info[0][n].props[0][0].find((movie) => {
        return movie.time > time;
      });
      if (typeof targetMovie !== "undefined") {
        var movieInfo = {
          "mvTheater": theater.name,
          "mvTitle": theater.cnm_info[0][n].title,
          "mvTime": targetMovie.time
        };
        moviesInfo.push(movieInfo);
      }
    }
  }
  console.log(moviesInfo)
  return moviesInfo;
}

function googleErrorMessage(row, err) {}

async function replyMessage(replyToken, messages) {
  await bot.reply(replyToken, messages)
    .then(function (data) {
      console.log('Success', data);
    }).catch(function (error) {
      console.log('Error', error);
    });
}

async function createUser(userId) {
  var params = {
    TableName: "eigabot_users",
    Item: {
      "user_id": userId,
      "situation": "address"
    }
  };
  await docClient.put(params, function (err, data) {
    if (err) {
      console.error("Unable to create user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Created user:", JSON.stringify(data, null, 2));
    }
  }).promise();
}

async function getUser(userId) {
  var params = {
    TableName: "eigabot_users",
    Key: {
      "user_id": userId
    }
  };
  var res = await docClient.get(params, function (err, data) {
    if (err) {
      console.error("Unable to get user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Got user:", JSON.stringify(data, null, 2));
    }
  }).promise();
  var user = JSON.stringify(res.Item);
  return user;
}

async function updateUser(keyParams, expAtr) {
  var params = {
    TableName: "eigabot_users",
    Key: keyParams,
    UpdateExpression: "set situation = :sit, lng = :lng, lat = :lat, place = :plc, displayResults = :dir, results = :rel, scheduledTime = :sct",
    ExpressionAttributeValues: expAtr,
    ReturnValues: "UPDATED_NEW"
  };
  var res = await docClient.update(params, function (err, data) {
    if (err) {
      console.error("Unable to update user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Updated user:", JSON.stringify(data, null, 2));
    }
  }).promise();
  var user = JSON.stringify(res.Item);
  return user;
}

async function deleteUser(userId) {
  var params = {
    TableName: "eigabot_users",
    Key: {
      "user_id": userId
    }
  };
  await docClient.delete(params, function (err, data) {
    if (err) {
      console.error("Undelete to delete user. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Deleted user:", JSON.stringify(data, null, 2));
    }
  }).promise();
}