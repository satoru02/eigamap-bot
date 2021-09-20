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
      case "postback":
        if(body.postback.data === 'restart') {
          var keyParams = {
            "user_id": userId,
          };
          var expAtr = resetParams();
          await updateUser(keyParams, expAtr);
          var addressMsg = setAddressMessage();
          messages.push(addressMsg);
          await replyMessage(replyToken, messages);
          break;
        } else {
          var res = await getUser(userId);
          var user = JSON.parse(res);
          var messages = await setReply(user, body);
          if (messages.length > 0) {
            await replyMessage(replyToken, messages);
          }
          break;
        }
      case "unfollow":
        await deleteUser(userId);
        break;
    }
  }

  async function setReply(user, eventBody) {
    var messages = [];
    switch (user.situation) {
      case "address":
        var messageType = eventBody.message.type;
        if (messageType != "text" && messageType != "location") {
          console.log(messageType)
          return messages;
        }
        var keyParams = {
          "user_id": user.user_id,
        };
        var expAtr = resetParams()
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
          var setTimeMsg = setTimeMessage();
          messages.push(setTimeMsg);

          var keyParams = {
            "user_id": user.user_id,
          };
          var expAtr = {
            ":sit": "time",
            ":lng": location.lng,
            ":lat": location.lat,
            ":plc": destination,
            ":sct": "",
            ":cur": "",
            ":dir": 0,
            ":rel": 0,
          };
          await updateUser(keyParams, expAtr);

        } else if (searchStatus == "ZERO_RESULTS") {
          var resetAddMsg = resetAddressMessage();
          messages.push(resetAddMsg);
        } else {
          var errorMsg = resetAddressMessage()
          messages.push(errorMsg);
        }
        break;
      case "time":
      case "searched":
        var nearByTheaters;
        var theatersInfo;
        var moviesInfo;
        var userTime;
        var keyParams = {
          "user_id": user.user_id,
        };

        if (eventBody.message) {
          var resetTimeMsg = resetTimeMessage();
          messages.push(resetTimeMsg);
          return messages;
        } else if (eventBody.postback.data === "datePick") {
          nearByTheaters = searchTheaters(user.lat, user.lng);
          theatersInfo = [];
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
            moviesInfo = processingInfo(theatersInfo, eventBody.postback.params.time);
            userTime = eventBody.postback.params.time;
            var expAtr = {
              ":sit": "searched",
              ":sct": eventBody.postback.params.time,
              ":lng": user.lng,
              ":lat": user.lat,
              ":plc": user.place,
              ":cur": moviesInfo,
              ":dir": 0,
              ":rel": 0,
            };
            await updateUser(keyParams, expAtr);
          } else {
            var noTheaterMsg = noTheaterMessage();
            var addressMsg = setAddressMessage();
            messages.push(noTheaterMsg, addressMsg);
            var expAtr = resetParams();
            await updateUser(keyParams, expAtr);
            return messages;
          }
        } else if (eventBody.postback.data === "moreResults") {
          moviesInfo = user.currentResults;
          userTime = user.scheduledTime;
        }

        if ((moviesInfo.length > 0) && (moviesInfo.length < 10)) {
          var finishMsg = searchFinishMessage(user.place, userTime, moviesInfo.length);
          var placesMsg = await theatersMessage(moviesInfo);
          messages.push(finishMsg, placesMsg);
          var expAtr = resetParams();
        } else if (moviesInfo.length > 10) {
          var moreRes = user.displayResults + 5;
          var remainInfo = moviesInfo.length - moreRes;
          var finishMsg = searchFinishMessage(user.place, userTime, moviesInfo.length);
          var placesMsg = await theatersMessage(moviesInfo.slice(user.displayResults, moreRes), remainInfo);
          messages.push(finishMsg, placesMsg);
          var expAtr = {
            ":sit": "searched",
            ":sct": userTime,
            ":lng": user.lng,
            ":lat": user.lat,
            ":plc": user.place,
            ":dir": moreRes,
            ":rel": moviesInfo.length,
            ":cur": moviesInfo
          };
        } else {
          var noTheaterMsg = noTheaterMessage();
          messages.push(noTheaterMsg);
          var expAtr = resetParams();
        }
        await updateUser(keyParams, expAtr);
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

function searchTheaters(lat, lng) {
  const theaterLists = [];
  const R = Math.PI / 180;
  theaters.features.forEach(theater => {
    var theaterLng = theater.geometry.coordinates[0];
    var theaterLat = theater.geometry.coordinates[1];
    // inside 20km;
    if (distance(lat, lng, theaterLat, theaterLng, R) < 10) {
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

function welcomeMessage() {
  var msg = {
    "type": "text",
    "text": "はじめまして$となりの映画館です$" + "\n\n"
     + "お友達登録ありがとうございます$ このアカウントでは、あなたが今いる場所からすぐ行ける映画館の上映情報をピックアップしてお届けします$$"  + "\n\n"
     + "今後も、様々な機能を追加していきますので、ご期待ください$$",
     "emojis": [
      {
        "index": 6,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "043"
      },
      {
        "index": 16,
        "productId": "5ac22bad031a6752fb806d67",
        "emojiId": "105"
      },
      {
        "index": 34,
        "productId": "5ac223c6040ab15980c9b44a",
        "emojiId": "035"
      },
      {
        "index": 85,
        "productId": "5ac21ae3040ab15980c9b440",
        "emojiId": "129"
      },
      {
        "index": 86,
        "productId": "5ac21ae3040ab15980c9b440",
        "emojiId": "129"
      },
      {
        "index": 117,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "028"
      },
      {
        "index": 118,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "028"
      }
    ]
  };
  return msg;
}

function setAddressMessage() {
  var msg = {
    "type": "text",
    "text": "それでは、映画を見たい場所を教えてください$" + "\n\n" +
      "ランドマーク(目印となる場所)の名前でも検索出来ます$" + "\n\n" +
      "現在地の情報は、左下の＋ボタンから「位置情報」を送信すると簡単です！",
      "emojis": [
      {
        "index": 21,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "023"
      },
      {
        "index": 50,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "111"
      },
    ]
  };
  return msg;
}

function resetAddressMessage() {
  var msg = {
    "type": "text",
    "text": "ごめんなさい！入力してもらった場所の近くに、映画館が見つかりませんでした。目的地の再入力をお願いします$",
    "emojis": [
      {
        "index": 51,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "024"
      }
    ],
  };
  return msg;
}

function setTimeMessage() {
  var msg = {
    "type": "text",
    "text": "何時くらいに観に行きますか？下のボタンから選んでください$",
    "emojis": [
      {
        "index": 28,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "190"
      }
    ],
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
    "text": "ごめんなさい!時間は下のボタンから選んでね。$",
    "emojis": [
      {
        "index": 22,
        "productId": "5ac21a18040ab15980c9b43e",
        "emojiId": "190"
      }
    ],
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
    "text": "ごめんなさい！目的の時間と場所からは上映情報が見つかりませんでした$$" + "\n\n" + "場所と時間を変えてみてね!",
    "emojis": [
      {
        "index": 33,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "024"
      },
      {
        "index": 34,
        "productId": "5ac1bfd5040ab15980c9b435",
        "emojiId": "024"
      }
    ],
  };
  return msg;
}

function searchFinishMessage(place, time, searchResults) {
  var msg = {
    "type": "text",
    "text": "お待たせしました！今から行ける映画情報はこちらです$" + "\n\n" +
      "検索場所：" + place + "\n" +
      "目的の時間：" + time + "\n" +
      "検索結果：" + searchResults + "件\n\n" +
      "①検索結果をさらに表示したい場合は、水色のMOREボタンを押してみてください。" + "\n\n" +
      "②目的地を変えて検索したい場合は、ピンク色のRESTARTボタンを押してみてください。",
    "emojis": [
      {
        "index": 25,
        "productId": "5ac2280f031a6752fb806d65",
        "emojiId": "176"
      }
    ],
  };
  return msg;
}

async function theatersMessage(moviesInfo, remainInfo) {
  const bubbleList = new Array();
  for (var i = 0; i < moviesInfo.length; i++) {
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
    var bubbleMsg = setBubbleMsg(moviesInfo[i].mvTheater, moviesInfo[i].mvTitle, moviesInfo[i].mvTime, movieImage);
    bubbleList.push(bubbleMsg);
  }

  if (remainInfo > 5) {
    var moreMsg = setMoreMsg();
    bubbleList.push(moreMsg);
  }

  var startMsg = setStartMsg();
  bubbleList.push(startMsg);

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

function setMoreMsg() {
  var moreMsg = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
          "type": "text",
          "text": "MORE",
          "weight": "bold",
          "size": "5xl",
          "margin": "xxl",
          "offsetTop": "110px",
          "offsetStart": "27px",
          "color": "#ffffff"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "lg",
          "spacing": "sm",
          "contents": [{
            "type": "box",
            "layout": "vertical",
            "contents": []
          }]
        }
      ],
      "height": "400px",
      "margin": "xl",
      "paddingTop": "xxl",
      "backgroundColor": "#00bbf9"
    },
    "footer": {
      "type": "box",
      "layout": "horizontal",
      "spacing": "sm",
      "contents": [{
          "type": "button",
          "height": "sm",
          "action": {
            "type": "postback",
            "label": "他の上映情報を検索",
            "data": "moreResults"
          },
          "color": "#000000"
        },
        {
          "type": "spacer",
          "size": "sm"
        }
      ],
      "flex": 0
    }
  };
  return moreMsg;
}

function setStartMsg() {
  var startMsg = {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [{
          "type": "text",
          "text": "RESET",
          "weight": "bold",
          "size": "5xl",
          "margin": "xxl",
          "offsetTop": "110px",
          "offsetStart": "27px",
          "color": "#ffffff"
        },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "lg",
          "spacing": "sm",
          "contents": [{
            "type": "box",
            "layout": "vertical",
            "contents": []
          }]
        }
      ],
      "height": "400px",
      "margin": "xl",
      "paddingTop": "xxl",
      "backgroundColor": "#f72585"
    },
    "footer": {
      "type": "box",
      "layout": "horizontal",
      "spacing": "sm",
      "contents": [{
          "type": "button",
          "height": "sm",
          "action": {
            "type": "postback",
            "label": "目的地検索に戻る",
            "data": "restart"
          },
          "color": "#000000"
        },
        {
          "type": "spacer",
          "size": "sm"
        }
      ],
      "flex": 0
    }
  };
  return startMsg;
}

function setBubbleMsg(theaterName, movieName, movieTime, movieImage) {
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
                "text": movieName,
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
                "text": theaterName,
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
                      "text": `${movieTime} 上映開始`,
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
  return bubbleMsg;
}

function processingInfo(theatersInfo, time) {
  const moviesInfo = new Array();
  var movieInfo;
  for (var i = 0; i < theatersInfo.length; i++) {
    if (typeof theatersInfo[i] !== "undefined") {
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
  }
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

function resetParams(){
  var resetParams = {
    ":sit": "address",
    ":lng": "",
    ":lat": "",
    ":plc": "",
    ":sct": "",
    ":cur": "",
    ":dir": 0,
    ":rel": 0,
  };
  return resetParams;
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
    UpdateExpression: "set situation = :sit, lng = :lng, lat = :lat, place = :plc, displayResults = :dir, results = :rel, scheduledTime = :sct, currentResults = :cur",
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